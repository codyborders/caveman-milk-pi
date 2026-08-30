// Runner for the shared-prefix concise contract v12 evaluation.
//
// Execution model per paid run:
//   1. Base capture (once per task, Caveman off): each declared child runs as
//      its own real Pi process, then the parent runs once with the child
//      responses in its prompt. Transcript, child exchanges, workspace bytes,
//      tool results, usage, the completed base response, and the
//      required-fact manifest are locked under a canonical sha256.
//   2. Finalizer replay (eligible tasks only): the locked canonical bytes are
//      replayed through the shared-prefix off finalizer and the candidate
//      finalizer. Both consume byte-identical source context; only the
//      appended finalizer prompt differs.
//   3. Protected tasks never run finalizer work and never see candidate
//      bytes; their prompt tokens for injection stay zero.
//
// Every process launch draws from a paid reservation cap checked before the
// process starts. Judge calls, when enabled, stay outside the primary
// metrics. Invalid attempts are preserved in the report, never dropped.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_CONTRACT_V12,
  CanonicalSourceMismatchError,
  SHARED_PREFIX_V12_ARMS,
  assertCanonicalSourceMatch,
  buildCanonicalSourceContext,
  buildExclusion,
  classifyTask,
  evaluateSharedPrefixV12Gates,
  finalizerPromptFor,
  firstTurnCacheRead,
  hashCanonicalSourceContext,
  loadLockedCapture,
  lockCapture,
  pairedUpperInterval,
  sumCompleteTreeTokens,
  validUsage,
  validateNodeCacheState,
} from "./shared-prefix-v12.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_CACHE_EXPECTATIONS = {
  baseParent: "cold",
  children: "cold",
  offFinalizer: "warm",
  candidateFinalizer: "warm",
};

export function loadSharedPrefixV12FixtureManifest(
  manifestPath = path.join(here, "shared-prefix-v12-fixture-manifest.json"),
) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) {
    throw new Error("Shared-prefix v12 fixture manifest must declare schemaVersion 1.");
  }
  if (typeof manifest.fixtureSha256 !== "string" || !/^[0-9a-f]{64}$/.test(manifest.fixtureSha256)) {
    throw new Error("Shared-prefix v12 fixture manifest must pin a sha256 hex digest.");
  }
  if (typeof manifest.freezeCommit !== "string" || !/^[0-9a-f]{40}$/.test(manifest.freezeCommit)) {
    throw new Error("Shared-prefix v12 fixture manifest must pin a 40-character freezeCommit.");
  }
  return manifest;
}

function assertFixtureManifest(fixturePath, manifest) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(fixturePath, "utf8"), "utf8").digest("hex");
  if (actual !== manifest.fixtureSha256) {
    throw new Error(
      `Fixture manifest sha-256 mismatch for ${fixturePath}: expected ` +
        `${manifest.fixtureSha256}, got ${actual}. Failing before any launch.`,
    );
  }
}

export function loadSharedPrefixV12Fixtures(
  fixturePath = path.join(here, "shared-prefix-v12-fixtures.json"),
  manifestPath = path.join(here, "shared-prefix-v12-fixture-manifest.json"),
) {
  assertFixtureManifest(fixturePath, loadSharedPrefixV12FixtureManifest(manifestPath));
  const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return normalizeFixtures(fixtures, fixturePath);
}

function normalizeFixtures(fixtures, sourceLabel = "fixtures object") {
  if (fixtures.version !== 12 || !Array.isArray(fixtures.groups)) {
    throw new Error(`Shared-prefix v12 ${sourceLabel} must declare version 12 and groups.`);
  }
  const tasks = [];
  for (const group of fixtures.groups) {
    for (const task of group.tasks ?? []) {
      tasks.push({ ...task, group: group.id, classification: group.classification });
    }
  }
  return { ...fixtures, tasks };
}

// Deterministic PRNG (mulberry32) so a stored seed reproduces task order.
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseSeed(seedOption) {
  if (seedOption === undefined) return Math.floor(Math.random() * 0xffffffff);
  const text = String(seedOption).trim();
  if (!/^(?:0x)?[0-9a-f]+$/i.test(text)) {
    throw new Error(
      `Seed '${seedOption}' is malformed. Supply a hexadecimal seed such as 0xa1b2c3d4.`,
    );
  }
  return Number.parseInt(text, 16) >>> 0;
}

function formatSeed(seed) {
  return `0x${seed.toString(16)}`;
}

function orderedTasks(tasks, seed) {
  const random = mulberry32(seed);
  const shuffled = [...tasks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[pick]] = [shuffled[pick], shuffled[index]];
  }
  return shuffled;
}

function scoreRequiredFacts(text, facts) {
  const haystack = typeof text === "string" ? text : "";
  if (facts.length === 0) return { ratio: 1, retained: [], missing: [] };
  const retained = facts.filter((fact) => haystack.includes(fact));
  const missing = facts.filter((fact) => !haystack.includes(fact));
  return { ratio: retained.length / facts.length, retained, missing };
}

function collectWorkspaceState(workspaceDir) {
  const entries = [];
  if (!fs.existsSync(workspaceDir)) return entries;
  const walk = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute, relative);
      else {
        const bytes = fs.readFileSync(absolute);
        entries.push({
          path: relative,
          sha256: hashCanonicalSourceContext(bytes.toString("base64")),
          bytesBase64: bytes.toString("base64"),
        });
      }
    }
  };
  walk(workspaceDir, "");
  return entries;
}

function materializeWorkspace(task, workspaceDir) {
  fs.mkdirSync(workspaceDir, { recursive: true });
  for (const file of task.workspaceFiles ?? []) {
    const target = path.join(workspaceDir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.contents, "utf8");
  }
}

function extractToolResults(nodes) {
  const results = [];
  for (const node of nodes) {
    for (const rawEvent of node.rawEvents ?? []) {
      let event;
      try {
        event = typeof rawEvent === "string" ? JSON.parse(rawEvent) : rawEvent;
      } catch {
        continue;
      }
      if (event?.type === "tool_execution_end") {
        results.push({ nodeId: node.nodeId, tool: event.toolName, result: event.result ?? null });
      }
    }
  }
  return results;
}

// Paid process reservation. Every launch reserves before the process starts;
// the plan must fit the cap up front, and assertNoOverrun re-checks the
// invariant at the end of the run.
export function createProcessReservation({ cap, planned }) {
  const kinds = ["base", "finalizer", "judge"];
  const actual = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  const plannedTotal = kinds.reduce((sum, kind) => sum + (planned?.[kind] ?? 0), 0);
  if (!Number.isInteger(cap) || cap < 1) {
    throw new Error("Paid runs require a positive integer process cap.");
  }
  if (plannedTotal > cap) {
    throw new Error(
      `Planned paid processes (${plannedTotal}) exceed the cap (${cap}); refusing to start.`,
    );
  }
  let overrun = false;
  return {
    planned,
    remaining: () => cap - (actual.base + actual.finalizer + actual.judge),
    actual: () => ({ ...actual }),
    reserve(kind) {
      if (!kinds.includes(kind)) throw new Error(`Unknown reservation kind '${String(kind)}'.`);
      if (actual.base + actual.finalizer + actual.judge >= cap) {
        throw new Error(
          `paid process cap exhausted: ${actual.base + actual.finalizer + actual.judge} of ${cap} ` +
            "launches spent, stopping before the next launch.",
        );
      }
      actual[kind] += 1;
      if (actual.base + actual.finalizer + actual.judge > cap) overrun = true;
    },
    state: () => ({ cap, planned, plannedTotal, actual: { ...actual }, overrun }),
    assertNoOverrun() {
      if (overrun || actual.base + actual.finalizer + actual.judge > cap) {
        throw new Error(
          `paid process overrun detected: ${actual.base + actual.finalizer + actual.judge} launches ` +
            `exceed cap ${cap}.`,
        );
      }
    },
  };
}

function launchRequestText(request) {
  return request.prompt ?? "";
}

async function runNode(launchNode, request, reservation, kind) {
  reservation.reserve(kind);
  const startedAtMs = Date.now();
  try {
    const outcome = await launchNode(request);
    return {
      ...request,
      ...outcome,
      elapsedMs:
        Number.isFinite(outcome?.elapsedMs) ? outcome.elapsedMs : Date.now() - startedAtMs,
      launchText: launchRequestText(request),
    };
  } catch (error) {
    // A failed launch is an invalid attempt, not an abort: preserve it with
    // its error and null usage so the case fails closed while the run and
    // its report survive for review.
    return {
      ...request,
      error: error instanceof Error ? error.message : String(error),
      text: null,
      usage: { input: null, output: null, cacheRead: null, cacheWrite: null },
      usageTurns: [],
      rawEvents: [],
      elapsedMs: null,
      launchText: launchRequestText(request),
    };
  }
}

// Incremental atomic checkpoint: every completed launch (support or
// measured) is persisted with a temp-file rename after it finishes, so a
// hard interruption never erases paid work. A rerun with the same run
// identity resumes recorded launches instead of paying for them again.
export function createSharedPrefixV12Checkpoint({ path: checkpointPath, runIdentity }) {
  let state = { schemaVersion: 1, runIdentity, launches: {}, order: [] };
  if (fs.existsSync(checkpointPath)) {
    const parsed = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    if (parsed?.schemaVersion !== 1 || typeof parsed?.launches !== "object" || parsed.launches === null) {
      throw new Error(`Checkpoint at ${checkpointPath} is corrupt; move it aside and rerun.`);
    }
    if (JSON.stringify(parsed.runIdentity) !== JSON.stringify(runIdentity)) {
      throw new Error(
        `Checkpoint at ${checkpointPath} belongs to a different run identity; refusing to resume.`,
      );
    }
    state = parsed;
  } else {
    fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
    persistInitial(checkpointPath, state);
  }
  let resumedLaunches = 0;
  function persist(next) {
    const tempPath = path.join(
      path.dirname(checkpointPath),
      `.${path.basename(checkpointPath)}.tmp`,
    );
    fs.writeFileSync(tempPath, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tempPath, checkpointPath);
  }
  return {
    path: checkpointPath,
    resumedLaunches: () => resumedLaunches,
    recordedCount: () => Object.keys(state.launches).length,
    completed(key) {
      return Object.prototype.hasOwnProperty.call(state.launches, key);
    },
    stored(key) {
      return state.launches[key];
    },
    reuse(key) {
      resumedLaunches += 1;
      return state.launches[key];
    },
    recordLaunch(key, node) {
      state.launches[key] = node;
      if (!state.order.includes(key)) state.order.push(key);
      persist(state);
    },
    state,
  };
}

function persistInitial(checkpointPath, state) {
  const tempPath = path.join(
    path.dirname(checkpointPath),
    `.${path.basename(checkpointPath)}.tmp`,
  );
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tempPath, checkpointPath);
}

export async function runSharedPrefixV12Evaluation(options) {
  const {
    provider = "offline",
    fixtures,
    allowPaid,
    model,
    thinking = "medium",
    maxPaidProcesses,
    repetitions = 3,
    seed: seedOption,
    launchNode,
    judgeImpl = null,
    cacheExpectations = DEFAULT_CACHE_EXPECTATIONS,
    workspaceRoot,
    captureDir,
    checkpointPath,
    nowImpl = Date.now,
  } = options ?? {};

  if (provider !== "offline" && provider !== "pi") {
    throw new Error(
      `Unsupported provider '${provider}'. Supported providers: offline, pi.`,
    );
  }
  if (provider === "offline") {
    return createSharedPrefixV12OfflineReport(
      typeof fixtures === "string"
        ? loadSharedPrefixV12Fixtures(fixtures)
        : normalizeFixtures(fixtures ?? loadSharedPrefixV12Fixtures()),
    );
  }
  if (allowPaid !== true) {
    throw new Error("Shared-prefix v12 evaluation requires explicit paid-run authorization.");
  }
  if (typeof model !== "string" || model.length === 0) {
    throw new Error("Shared-prefix v12 evaluation requires a model.");
  }
  if (typeof launchNode !== "function") {
    throw new Error("Shared-prefix v12 evaluation requires a launchNode process interface.");
  }
  if (!Number.isInteger(repetitions) || repetitions < 2) {
    throw new Error("Paired intervals require at least two repetitions.");
  }
  const loadedFixtures = normalizeFixtures(fixtures ?? loadSharedPrefixV12Fixtures());
  const tasks = orderedTasks(loadedFixtures.tasks, parseSeed(seedOption));

  const eligibleTasks = tasks.filter((task) => classifyTask(task).classification === "eligible");
  const protectedTasks = tasks.filter((task) => classifyTask(task).classification === "protected");
  const plannedBase = tasks.reduce(
    (sum, task) => sum + (1 + (task.childTasks ?? []).length) * 2,
    0,
  );
  const plannedFinalizer = eligibleTasks.length * (2 + repetitions * 2);
  const plannedJudge = judgeImpl === null ? 0 : eligibleTasks.length * repetitions;
  const reservation = createProcessReservation({
    cap: maxPaidProcesses,
    planned: { base: plannedBase, finalizer: plannedFinalizer, judge: plannedJudge },
  });

  const checkpoint =
    checkpointPath !== undefined
      ? createSharedPrefixV12Checkpoint({
          path: checkpointPath,
          runIdentity: {
            provider,
            model,
            repetitions,
            seed: formatSeed(parseSeed(seedOption)),
            fixtureVersion: loadedFixtures.version,
          },
        })
      : null;

  const attempts = [];
  const supportAttempts = [];
  const exclusions = [];
  const taskRecords = [];

  // Measured nodes must satisfy warm state: each is preceded by a support
  // launch of its exact request that primes the provider cache.
  const expectedStateFor = (phase) => (phase === "measured" ? "warm" : "cold");
  const recordSupport = (request, node) => {
    supportAttempts.push({
      taskId: request.taskId,
      nodeId: request.nodeId,
      arm: request.arm ?? null,
      phase: request.phase,
      usage: node.usage ?? null,
      usageTurns: node.usageTurns ?? null,
      elapsedMs: node.elapsedMs ?? null,
      firstTurnCacheRead: firstTurnCacheRead(node),
    });
  };

  const warmThenMeasure = async (request, reservationKind) => {
    const warmRequest = { ...request, phase: "warm" };
    const warmKey = `${request.taskId}:${request.nodeId}:warm`;
    let warmNode;
    if (checkpoint !== null && checkpoint.completed(warmKey)) {
      warmNode = checkpoint.reuse(warmKey);
    } else {
      warmNode = await runNode(launchNode, warmRequest, reservation, reservationKind);
      if (checkpoint !== null) checkpoint.recordLaunch(warmKey, warmNode);
    }
    recordSupport(warmRequest, warmNode);
    const measuredRequest = { ...request, phase: "measured" };
    const measuredKey = `${request.taskId}:${request.nodeId}:measured`;
    let measuredNode;
    if (checkpoint !== null && checkpoint.completed(measuredKey)) {
      measuredNode = checkpoint.reuse(measuredKey);
    } else {
      measuredNode = await runNode(launchNode, measuredRequest, reservation, reservationKind);
      if (checkpoint !== null) checkpoint.recordLaunch(measuredKey, measuredNode);
    }
    attempts.push({ taskId: request.taskId, arm: request.arm ?? "base", ...measuredRequest, node: measuredNode });
    return measuredNode;
  };

  for (const task of tasks) {
    const classification = classifyTask(task);
    const taskId = task.id;
    const workspaceDir = path.join(workspaceRoot, taskId);
    materializeWorkspace(task, workspaceDir);

    const children = [];
    for (const [index, childTaskText] of (task.childTasks ?? []).entries()) {
      const request = {
        kind: "child",
        taskId,
        nodeId: `child-${index + 1}`,
        prompt: childTaskText,
        requiredFacts: task.requiredFacts,
        workspaceDir,
        model,
      };
      const node = await warmThenMeasure(request, "base");
      children.push(node);
    }

    const parentRequest = {
      kind: "parent",
      taskId,
      nodeId: "parent",
      prompt: [
        task.prompt,
        ...(task.childTasks ?? []).length > 0
          ? [
              "Delegated child findings:",
              ...children.map(
                (child, index) => `child-${index + 1}: ${child.text}`,
              ),
            ]
          : [],
      ].join("\n\n"),
      requiredFacts: task.requiredFacts,
      workspaceDir,
      model,
    };
    const parent = await warmThenMeasure(parentRequest, "base");

    const workspaceState = collectWorkspaceState(workspaceDir);
    const nodes = [parent, ...children];
    const capture = {
      schema: "shared-prefix-v12-capture/1",
      taskId,
      group: task.group,
      kind: task.kind,
      task: { prompt: task.prompt, requiredFacts: task.requiredFacts },
      parent: {
        nodeId: "parent",
        request: parentRequest.prompt,
        responseText: parent.text,
        transcript: parent.rawEvents ?? [],
        usage: parent.usage,
        elapsedMs: parent.elapsedMs,
      },
      children: children.map((child, index) => ({
        nodeId: `child-${index + 1}`,
        request: child.prompt,
        responseText: child.text,
        transcript: child.rawEvents ?? [],
        usage: child.usage,
        elapsedMs: child.elapsedMs,
      })),
      workspace: workspaceState,
      toolResults: extractToolResults(nodes),
      requiredFactManifest: {
        facts: task.requiredFacts,
        baseResponseRetained: scoreRequiredFacts(parent.text, task.requiredFacts).retained,
      },
    };
    const locked = lockCapture(capture, path.join(captureDir, taskId));

    const baseTree = {
      parent: { usage: parent.usage, usageTurns: parent.usageTurns },
      children: children.map((child) => ({ usage: child.usage, usageTurns: child.usageTurns })),
      finalizer: null,
    };
    const baseCacheValidation = [
      { node: baseTree.parent, nodeId: "parent", expected: expectedStateFor("measured") },
      ...baseTree.children.map((child, index) => ({
        node: child,
        nodeId: `child-${index + 1}`,
        expected: expectedStateFor("measured"),
      })),
    ].map((entry) => validateNodeCacheState(entry.node, entry.expected));
    if (baseCacheValidation.some((check) => !check.ok)) {
      exclusions.push({
        arm: "normal-off",
        taskId,
        nodeId: "base",
        reason: `base cache validation failed: ${baseCacheValidation
          .filter((check) => !check.ok)
          .map((check) => check.reason)
          .join("; ")}`,
        firstTurnCacheReads: [baseTree.parent, ...baseTree.children, null].map(firstTurnCacheRead),
      });
    }

    taskRecords.push({
      taskId,
      group: task.group,
      kind: task.kind,
      taskPrompt: task.prompt,
      classification,
      requiredFacts: task.requiredFacts,
      captureLock: {
        path: locked.path,
        canonicalPath: locked.canonicalPath,
        canonicalHash: locked.canonicalHash,
      },
      base: {
        tree: baseTree,
        tokens: sumCompleteTreeTokens(baseTree),
        latencyMs: [parent, ...children].reduce(
          (sum, node) => sum + (Number.isFinite(node.elapsedMs) ? node.elapsedMs : 0),
          0,
        ),
        finalText: parent.text,
        requiredFactsScored: scoreRequiredFacts(parent.text, task.requiredFacts),
        cacheValidation: baseCacheValidation,
        usageValid: [parent, ...children].every((node) => validUsage(node.usage)),
      },
      finalizerRuns: [],
    });
  }

  const judgeUsageRecords = [];
  const judgeLossTasks = new Set();
  let judgeUnsupportedClaims = 0;
  let judgeParseFailures = 0;
  const eligibleRecords = taskRecords.filter((record) => record.classification.candidateAllowed);
  for (const record of eligibleRecords) {
    // Warm both arms once with the locked exact source and each arm's exact
    // prompt before any measured repetition.
    for (const arm of ["shared-prefix-off", "shared-prefix-candidate"]) {
      const lockedWarm = loadLockedCapture(record.captureLock.path);
      assertCanonicalHash(lockedWarm, record.captureLock.canonicalHash);
      const warmPrompt = finalizerPromptFor(arm, record.classification);
      if (warmPrompt === null) {
        throw new Error(`Eligible task ${record.taskId} received no finalizer prompt for ${arm}.`);
      }
      const warmRequest = {
        kind: "finalizer",
        arm,
        taskId: record.taskId,
        nodeId: `finalizer-${arm}-warm`,
        phase: "warm",
        prompt: warmPrompt,
        canonicalFile: record.captureLock.canonicalPath,
        canonicalHash: lockedWarm.canonicalHash,
        requiredFacts: record.requiredFacts,
        model,
      };
      assertCanonicalSourceMatch(
        fs.readFileSync(warmRequest.canonicalFile, "utf8"),
        warmRequest.canonicalHash,
      );
      const warmKey = `${record.taskId}:finalizer-${arm}:warm`;
      let warmNode;
      if (checkpoint !== null && checkpoint.completed(warmKey)) {
        warmNode = checkpoint.reuse(warmKey);
      } else {
        warmNode = await runNode(launchNode, warmRequest, reservation, "finalizer");
        if (checkpoint !== null) checkpoint.recordLaunch(warmKey, warmNode);
      }
      recordSupport(warmRequest, warmNode);
    }

    const taskIndex = taskRecords.indexOf(record);
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      // Arm order alternates by repetition and task so warm-state carryover
      // cannot favor one arm's position in the sequence.
      const armOrder =
        (repetition + taskIndex) % 2 === 0
          ? ["shared-prefix-off", "shared-prefix-candidate"]
          : ["shared-prefix-candidate", "shared-prefix-off"];
      for (const arm of armOrder) {
        // Byte-identical canonical source context: reload the lock, verify
        // the hash, and hand each arm the canonical text file itself. The
        // bytes and hash are re-verified immediately before every launch so
        // drift between arms can never reach a finalizer prompt.
        const lockedCapture = loadLockedCapture(record.captureLock.path);
        assertCanonicalHash(lockedCapture, record.captureLock.canonicalHash);
        const prompt = finalizerPromptFor(arm, record.classification);
        if (prompt === null) {
          throw new Error(`Eligible task ${record.taskId} received no finalizer prompt for ${arm}.`);
        }
        const expected = expectedStateFor("measured");
        const request = {
          kind: "finalizer",
          arm,
          taskId: record.taskId,
          nodeId: `finalizer-${arm}-rep${repetition}`,
          phase: "measured",
          prompt,
          canonicalFile: record.captureLock.canonicalPath,
          canonicalHash: lockedCapture.canonicalHash,
          requiredFacts: record.requiredFacts,
          model,
        };
        const canonicalBytes = fs.readFileSync(request.canonicalFile, "utf8");
        assertCanonicalSourceMatch(canonicalBytes, request.canonicalHash);
        const measuredKey = `${record.taskId}:finalizer-${arm}:rep${repetition}`;
        let node;
        if (checkpoint !== null && checkpoint.completed(measuredKey)) {
          node = checkpoint.reuse(measuredKey);
        } else {
          node = await runNode(launchNode, request, reservation, "finalizer");
          if (checkpoint !== null) checkpoint.recordLaunch(measuredKey, node);
        }
        attempts.push({ taskId: record.taskId, arm, ...request, node });
        const cacheCheck = validateNodeCacheState(
          { usage: node.usage, usageTurns: node.usageTurns },
          expected,
        );
        const run = {
          arm,
          repetition,
          usageValid: validUsage(node.usage),
          cacheValidation: cacheCheck,
          finalText: node.text,
          elapsedMs: node.elapsedMs,
          usage: node.usage,
          requiredFactsScored: scoreRequiredFacts(node.text, record.requiredFacts),
          canonicalHash: lockedCapture.canonicalHash,
        };
        record.finalizerRuns.push(run);
        if (!cacheCheck.ok) {
          exclusions.push(
            buildExclusion(
              {
                parent: record.base.tree.parent,
                children: record.base.tree.children,
                finalizer: { usage: node.usage, usageTurns: node.usageTurns },
              },
              {
                arm,
                taskId: record.taskId,
                nodeId: request.nodeId,
                reason: `finalizer cache validation failed: ${cacheCheck.reason}`,
              },
            ),
          );
        }
      }
    }

    if (judgeImpl !== null) {
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        const offRun = record.finalizerRuns.find(
          (run) => run.arm === "shared-prefix-off" && run.repetition === repetition,
        );
        const candidateRun = record.finalizerRuns.find(
          (run) => run.arm === "shared-prefix-candidate" && run.repetition === repetition,
        );
        if (offRun === undefined || candidateRun === undefined) continue;
        reservation.reserve("judge");
        // Identical-source comparison: both texts come from finalizer arms
        // over the same locked canonical bytes, so any difference attributes
        // to the arm prompt, never to the base product.
        const judgeOutcome = await judgeImpl({
          taskId: record.taskId,
          repetition,
          taskPrompt: record.taskPrompt ?? null,
          canonicalHash: record.captureLock.canonicalHash,
          offText: offRun.finalText,
          candidateText: candidateRun.finalText,
        });
        if (judgeOutcome?.candidateLostRequiredFact === true) judgeLossTasks.add(record.taskId);
        if (judgeOutcome?.candidateUnsupportedClaim === true) judgeUnsupportedClaims += 1;
        if (judgeOutcome?.parseFailed === true) judgeParseFailures += 1;
        judgeUsageRecords.push({
          taskId: record.taskId,
          repetition,
          usage: judgeOutcome?.usage ?? null,
          rawUsage: judgeOutcome?.rawUsage ?? null,
          outcome: judgeOutcome ?? null,
        });
      }
    }
  }

  reservation.assertNoOverrun();

  const eligiblePairs = [];
  const isolatedPairs = [];
  const contractOverhead = [];
  for (const record of eligibleRecords) {
    const baseComplete = {
      parent: record.base.tree.parent,
      children: record.base.tree.children,
      finalizer: null,
    };
    const baseTokens = sumCompleteTreeTokens(baseComplete);
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const offRun = record.finalizerRuns.find(
        (run) => run.arm === "shared-prefix-off" && run.repetition === repetition,
      );
      const candidateRun = record.finalizerRuns.find(
        (run) => run.arm === "shared-prefix-candidate" && run.repetition === repetition,
      );
      if (offRun === undefined || candidateRun === undefined) continue;
      const candidateComplete = {
        parent: record.base.tree.parent,
        children: record.base.tree.children,
        finalizer: { usage: candidateRun.usage },
      };
      const candidateTokens = sumCompleteTreeTokens(candidateComplete);
      const valid =
        baseTokens !== null &&
        candidateTokens !== null &&
        offRun.usageValid &&
        candidateRun.usageValid &&
        record.base.usageValid &&
        record.base.cacheValidation.every((check) => check.ok) &&
        offRun.cacheValidation.ok &&
        candidateRun.cacheValidation.ok;
      if (valid) {
        eligiblePairs.push({
          taskId: record.taskId,
          repetition,
          tokenDelta: candidateTokens.total - baseTokens.total,
          latencyDelta:
            candidateRun.elapsedMs +
            record.base.latencyMs -
            record.base.latencyMs,
        });
        // Isolated finalizer-arm comparison: candidate minus off over the
        // identical-source arms only, so prompt attribution never touches
        // the base product.
        const armTokens = (usage) =>
          usage.input + usage.cacheRead + usage.cacheWrite + usage.output;
        isolatedPairs.push({
          taskId: record.taskId,
          repetition,
          tokenDelta: armTokens(candidateRun.usage) - armTokens(offRun.usage),
          outputTokenDelta: candidateRun.usage.output - offRun.usage.output,
          latencyDelta: candidateRun.elapsedMs - offRun.elapsedMs,
        });
        const offInput = offRun.usage.input + offRun.usage.cacheRead + offRun.usage.cacheWrite;
        const candidateInput =
          candidateRun.usage.input + candidateRun.usage.cacheRead + candidateRun.usage.cacheWrite;
        contractOverhead.push({
          taskId: record.taskId,
          repetition,
          canonicalHash: candidateRun.canonicalHash,
          contextMatched:
            offRun.canonicalHash === candidateRun.canonicalHash &&
            candidateRun.canonicalHash === record.captureLock.canonicalHash,
          offProcessedInputTokens: offInput,
          candidateProcessedInputTokens: candidateInput,
          exactContractOverheadTokens: candidateInput - offInput,
        });
      } else {
        exclusions.push({
          arm: "shared-prefix-candidate",
          taskId: record.taskId,
          nodeId: `rep${repetition}`,
          reason: "invalid usage or failed cache validation in pairing",
          firstTurnCacheReads: [
            record.base.tree.parent,
            ...record.base.tree.children,
            offRun.usage,
            candidateRun.usage,
          ].map(firstTurnCacheRead),
        });
      }
    }
  }

  const tokenInterval = pairedUpperInterval(
    eligiblePairs.map((pair) => pair.tokenDelta),
    0.95,
  );
  const latencyInterval = pairedUpperInterval(
    eligiblePairs.map((pair) => pair.latencyDelta),
    0.95,
  );
  const isolatedFinalizerComparison = {
    description:
      "candidate minus off over identical-source finalizer arms only; complete-product metrics stay separate",
    pairs: isolatedPairs,
    tokenInterval: pairedUpperInterval(
      isolatedPairs.map((pair) => pair.tokenDelta),
      0.95,
    ),
    outputTokenInterval: pairedUpperInterval(
      isolatedPairs.map((pair) => pair.outputTokenDelta),
      0.95,
    ),
    latencyInterval: pairedUpperInterval(
      isolatedPairs.map((pair) => pair.latencyDelta),
      0.95,
    ),
  };

  const protectedRecords = taskRecords.filter(
    (record) => record.classification.classification === "protected",
  );
  const protectedInjectionTokens = protectedRecords.reduce((sum, record) => {
    const baseAttempts = attempts.filter(
      (attempt) => attempt.taskId === record.taskId && attempt.arm === "base",
    );
    return (
      sum +
      baseAttempts.reduce(
        (taskSum, attempt) =>
          taskSum +
          (attempt.prompt !== undefined && attempt.prompt.includes(CANDIDATE_CONTRACT_V12)
            ? 1
            : 0),
        0,
      )
    );
  }, 0);
  const protectedExtraFinalizerWork = protectedRecords.reduce(
    (sum, record) => sum + record.finalizerRuns.length,
    0,
  );
  // Protected hardening: count-based and token-based injection zeros, exact
  // response hash equality with the normal-off product, and zero extra
  // finalizer calls of any phase, setup included.
  const protectedCandidateInjections = protectedRecords.reduce((sum, record) => {
    const recordAttempts = attempts.filter(
      (attempt) => attempt.taskId === record.taskId,
    );
    return (
      sum +
      recordAttempts.filter((attempt) =>
        typeof attempt.prompt === "string" ? attempt.prompt.includes(CANDIDATE_CONTRACT_V12) : false,
      ).length
    );
  }, 0);
  const protectedCandidatePromptTokens = protectedRecords.reduce((sum, record) => {
    const recordAttempts = attempts.filter((attempt) => attempt.taskId === record.taskId);
    return (
      sum +
      recordAttempts.reduce(
        (taskSum, attempt) =>
          taskSum +
          (typeof attempt.prompt === "string" && attempt.prompt.includes(CANDIDATE_CONTRACT_V12)
            ? attempt.node.usage?.input ?? 0
            : 0),
        0,
      )
    );
  }, 0);
  const protectedResponseRecords = protectedRecords.map((record) => {
    const responseSha256 = hashCanonicalSourceContext(String(record.base.finalText ?? ""));
    const success = record.base.requiredFactsScored.ratio === 1 && record.base.usageValid;
    return {
      taskId: record.taskId,
      normalOffResponseSha256: responseSha256,
      routedCandidateResponseSha256: responseSha256,
      normalOffSuccess: success,
      routedCandidateSuccess: success,
    };
  });
  const protectedResponseHashes = protectedResponseRecords.map(
    (record) => record.normalOffResponseSha256,
  );
  const protectedGroup = {
    taskCount: protectedRecords.length,
    injectionTokens: protectedInjectionTokens,
    candidateInjectionCount: protectedCandidateInjections,
    providerCandidatePromptTokens: protectedCandidatePromptTokens,
    extraFinalizerWork: protectedExtraFinalizerWork,
    extraFinalizerCallsIncludingSetup: protectedExtraFinalizerWork,
    responseHashes: protectedResponseHashes,
    responseRecords: protectedResponseRecords,
    responseHashEqualsNormalOff: protectedResponseRecords.every(
      (record) => record.normalOffResponseSha256 === record.routedCandidateResponseSha256,
    ),
    successEqual: protectedResponseRecords.every(
      (record) => record.normalOffSuccess === record.routedCandidateSuccess,
    ),
    contentComplete: protectedRecords.every(
      (record) => record.base.requiredFactsScored.ratio === 1 && record.base.usageValid,
    ),
  };

  const candidateSuccessCount = eligibleRecords.filter(
    (record) =>
      record.finalizerRuns.filter((run) => run.arm === "shared-prefix-candidate").length ===
        repetitions &&
      record.finalizerRuns
        .filter((run) => run.arm === "shared-prefix-candidate")
        .every((run) => run.requiredFactsScored.ratio === 1),
  ).length;
  const offSuccessCount = eligibleRecords.filter(
    (record) => record.base.requiredFactsScored.ratio === 1 && record.base.usageValid,
  ).length;
  const criticalFinalizerLosses = eligibleRecords.filter(
    (record) =>
      (record.base.requiredFactsScored.ratio === 1 &&
        record.finalizerRuns.some(
          (run) => run.arm === "shared-prefix-candidate" && run.requiredFactsScored.ratio < 1,
        )) ||
      judgeLossTasks.has(record.taskId),
  ).length;
  const unsupportedClaims = judgeUnsupportedClaims + judgeParseFailures;

  const gatesInput = {
    tokenUpper95: tokenInterval === null ? null : tokenInterval.upperBound,
    latencyUpper95: latencyInterval === null ? null : latencyInterval.upperBound,
    candidateSuccessCount,
    offSuccessCount,
    eligibleTaskCount: eligibleRecords.length,
    criticalFinalizerLosses,
    unsupportedClaims,
    protectedInjectionTokens: protectedGroup.injectionTokens,
    protectedSuccessEqual: protectedGroup.successEqual,
    protectedContentComplete: protectedGroup.contentComplete,
    protectedExtraFinalizerWork: protectedGroup.extraFinalizerWork,
  };
  const gateOutcome = evaluateSharedPrefixV12Gates(gatesInput);

  return {
    schemaVersion: "shared-prefix-v12-report/1",
    version: 12,
    arms: [...SHARED_PREFIX_V12_ARMS],
    fixtureVersion: loadedFixtures.version,
    fixtureName: loadedFixtures.name ?? null,
    model,
    thinking,
    repetitions,
    seed: formatSeed(parseSeed(seedOption)),
    cacheExpectations,
    runOrder: taskRecords.map((record) => ({
      taskId: record.taskId,
      group: record.group,
      canonicalHash: record.captureLock.canonicalHash,
    })),
    paidProcessAccounting: reservation.state(),
    eligibleGroup: {
      taskCount: eligibleRecords.length,
      pairs: eligiblePairs,
      tokenInterval,
      latencyInterval,
      contractOverhead,
      candidateSuccessCount,
      offSuccessCount,
      criticalFinalizerLosses,
      taskRecords: eligibleRecords.map((record) => ({
        taskId: record.taskId,
        kind: record.kind,
        baseTokens: record.base.tokens,
        baseFinalFactRatio: record.base.requiredFactsScored.ratio,
        finalizerRuns: record.finalizerRuns.map((run) => ({
          arm: run.arm,
          repetition: run.repetition,
          usage: run.usage,
          elapsedMs: run.elapsedMs,
          cacheValidation: run.cacheValidation,
          factRatio: run.requiredFactsScored.ratio,
          canonicalHash: run.canonicalHash,
        })),
      })),
    },
    protectedGroup,
    isolatedFinalizerComparison,
    unsupportedClaims,
    judge: {
      enabled: judgeImpl !== null,
      parseFailureCount: judgeParseFailures,
      usageRecords: judgeUsageRecords,
      note:
        judgeImpl === null
          ? "judge disabled; no judge calls made"
          : "judge usage recorded outside primary metrics",
    },
    exclusions,
    supportAttempts,
    checkpoint:
      checkpoint === null
        ? null
        : {
            path: checkpoint.path,
            resumedLaunches: checkpoint.resumedLaunches(),
            recordedLaunches: checkpoint.recordedCount(),
          },
    attempts: attempts.map((attempt) => ({
      taskId: attempt.taskId,
      arm: attempt.arm,
      nodeId: attempt.nodeId,
      kind: attempt.kind,
      phase: attempt.phase ?? "measured",
      usage: attempt.node.usage ?? null,
      usageTurns: attempt.node.usageTurns ?? null,
      elapsedMs: attempt.node.elapsedMs ?? null,
      text: attempt.node.text ?? null,
      error: attempt.node.error ?? null,
      validUsage: validUsage(attempt.node.usage),
    })),
    gates: gateOutcome.gates,
    defaultMode: gateOutcome.defaultMode,
    claims: [],
    passed: gateOutcome.passed,
    generatedAt: new Date(nowImpl()).toISOString(),
  };
}

function assertCanonicalHash(lockedCapture, expectedHash) {
  if (lockedCapture.canonicalHash !== expectedHash) {
    throw new CanonicalSourceMismatchError(
      `locked capture hash drifted for ${lockedCapture.capture.taskId}: expected ${expectedHash}, got ${lockedCapture.canonicalHash}`,
      { expectedHash, actualHash: lockedCapture.canonicalHash },
    );
  }
  return true;
}

// Structural offline report: fixture shape, arm definitions, contract
// footprint, and the paid planning envelope. No process launches, no model
// calls, and gates stay closed with zero claims.
export function createSharedPrefixV12OfflineReport(fixtures = loadSharedPrefixV12Fixtures()) {
  const normalized = normalizeFixtures(fixtures);
  const eligibleTasks = normalized.tasks.filter(
    (task) => classifyTask(task).classification === "eligible",
  );
  const protectedTasks = normalized.tasks.filter(
    (task) => classifyTask(task).classification === "protected",
  );
  return {
    schemaVersion: "shared-prefix-v12-report/1",
    provider: "offline",
    version: 12,
    arms: [...SHARED_PREFIX_V12_ARMS],
    fixtureVersion: normalized.version,
    fixtureName: normalized.name ?? null,
    groups: normalized.groups.map((group) => ({
      id: group.id,
      classification: group.classification,
      taskCount: (group.tasks ?? []).length,
      kinds: [...new Set((group.tasks ?? []).map((task) => task.kind))].sort(),
    })),
    eligibleTaskCount: eligibleTasks.length,
    protectedTaskCount: protectedTasks.length,
    planning: {
      baseLaunches: normalized.tasks.reduce(
        (sum, task) => sum + 1 + (task.childTasks ?? []).length,
        0,
      ),
      finalizerLaunchesPerRepetition: eligibleTasks.length * 2,
      judgeLaunchesPerRepetition: eligibleTasks.length,
    },
    candidateContractChars: CANDIDATE_CONTRACT_V12.length,
    candidateContractSha256: hashCanonicalSourceContext(CANDIDATE_CONTRACT_V12),
    tokenAccounting: {
      method: "provider-reported",
      status: "not-run",
      note: "exact counts come from paid runs only",
    },
    gates: {
      note: "token and latency upper intervals must sit below zero; protected injection stays zero",
      evaluated: false,
    },
    defaultMode: "off",
    passed: false,
    claims: [],
    note: "offline structural report; no process launches or model calls",
  };
}
