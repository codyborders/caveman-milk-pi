import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// Shared-prefix concise contract v12 evaluation.
//
// Design: a paid run captures one Caveman-off base execution per task (parent
// plus real children), locks the canonical source context bytes, and then
// replays those exact bytes through two finalizer arms that differ only in
// the finalizer prompt. The candidate contract is appended only after a
// positive eligibility classification. Protected tasks bypass all finalizer
// work and candidate injection with zero prompt tokens.
//
// This module is evaluation infrastructure only. It never changes runtime
// injection, and the candidate contract below never ships in src/.

export const SHARED_PREFIX_V12_VERSION = 12;

export const SHARED_PREFIX_V12_ARMS = [
  "normal-off",
  "shared-prefix-off",
  "shared-prefix-candidate",
];

// Minimal candidate contract, eligible prose only. It must not enumerate
// protected categories: eligibility classification, not prompt text, keeps
// protected work away from the candidate. Every byte is billed on top of
// the shared prefix, and its exact provider-reported overhead is measured.
export const CANDIDATE_CONTRACT_V12 = [
  "Write the final answer concisely in complete prose.",
  "Preserve every supplied required fact and qualification.",
  "Add no claims beyond the source context.",
  "Return only the final answer.",
].join(" ");

// Neutral finalizer instruction used by the shared-prefix off arm. The
// candidate arm appends the contract to this same base instruction, so the
// only differing bytes between finalizer arms are the contract itself.
export const SHARED_PREFIX_OFF_FINALIZER_PROMPT = [
  "Produce the final response for the original task using the captured source context.",
  "Keep every requested fact.",
].join(" ");

// Fields that hold measurements, not source bytes. They stay in the capture
// record for metrics but must never enter the canonical source context the
// finalizers consume, so equal sources always hash identically.
const VOLATILE_NODE_FIELDS = new Set(["usage", "rawUsage", "elapsedMs", "startedAtMs", "timestamp"]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_NODE_FIELDS.has(key)) continue;
      sorted[key] = canonicalValue(value[key]);
    }
    return sorted;
  }
  return value;
}

// Byte-exact serialization of everything the finalizers are allowed to see:
// the task, the full parent transcript, every child request and response,
// workspace bytes, tool results, the completed base response, and the
// required-fact manifest. Volatile measurement fields are stripped.
export function buildCanonicalSourceContext(capture) {
  if (capture === null || typeof capture !== "object") {
    throw new Error("Canonical source context requires a capture object.");
  }
  const canonical = canonicalValue({
    schema: capture.schema,
    taskId: capture.taskId,
    group: capture.group,
    kind: capture.kind,
    task: capture.task,
    parent: capture.parent,
    children: capture.children,
    workspace: capture.workspace,
    toolResults: capture.toolResults,
    requiredFactManifest: capture.requiredFactManifest,
  });
  return JSON.stringify(canonical, null, 2);
}

export function hashCanonicalSourceContext(canonicalText) {
  return crypto.createHash("sha256").update(canonicalText, "utf8").digest("hex");
}

export class CanonicalSourceMismatchError extends Error {
  constructor(message, info) {
    super(message);
    this.name = "CanonicalSourceMismatchError";
    this.expectedHash = info.expectedHash ?? null;
    this.actualHash = info.actualHash ?? null;
  }
}

// Both finalizer arms must consume byte-identical canonical source bytes.
// Any mismatch is an integrity break: reject before a finalizer prompt is
// built or a paid launch happens.
export function assertCanonicalSourceMatch(canonicalText, expectedHash) {
  const actualHash = hashCanonicalSourceContext(canonicalText);
  if (actualHash !== expectedHash) {
    throw new CanonicalSourceMismatchError(
      `canonical source context hash mismatch: expected ${expectedHash}, got ${actualHash}`,
      { expectedHash, actualHash },
    );
  }
  return true;
}

// Write-once capture lock. The capture plus its canonical hash land in an
// atomically renamed JSON file, and the exact canonical source bytes land in
// a sibling text file the finalizers consume through --append-system-prompt.
// Finalizer arms must go through loadLockedCapture so tampered bytes can
// never reach a finalizer prompt.
export function lockCapture(capture, directory, { fsImpl = fs, cryptoImpl = crypto } = {}) {
  const canonicalText = buildCanonicalSourceContext(capture);
  const canonicalHash = hashCanonicalSourceContext(canonicalText);
  const targetPath = path.join(directory, `capture-${capture.taskId}.json`);
  const canonicalPath = path.join(directory, `capture-${capture.taskId}.canonical.txt`);
  fsImpl.mkdirSync(directory, { recursive: true });
  const stamp = canonicalHash.slice(0, 12);
  const tempPath = path.join(directory, `.${path.basename(targetPath)}.${stamp}.tmp`);
  const record = { schema: "shared-prefix-v12-capture-lock/1", capture, canonicalHash };
  fsImpl.writeFileSync(tempPath, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  fsImpl.renameSync(tempPath, targetPath);
  const tempCanonicalPath = path.join(directory, `.${path.basename(canonicalPath)}.${stamp}.tmp`);
  fsImpl.writeFileSync(tempCanonicalPath, canonicalText, "utf8");
  fsImpl.renameSync(tempCanonicalPath, canonicalPath);
  return { path: targetPath, canonicalPath, canonicalHash };
}

export function loadLockedCapture(lockPath, { fsImpl = fs } = {}) {
  const record = JSON.parse(fsImpl.readFileSync(lockPath, "utf8"));
  if (
    record?.schema !== "shared-prefix-v12-capture-lock/1" ||
    record?.capture === null ||
    typeof record?.canonicalHash !== "string"
  ) {
    throw new Error(`capture lock at ${lockPath} is not a shared-prefix-v12 capture lock.`);
  }
  const canonicalText = buildCanonicalSourceContext(record.capture);
  assertCanonicalSourceMatch(canonicalText, record.canonicalHash);
  return { capture: record.capture, canonicalText, canonicalHash: record.canonicalHash, path: lockPath };
}

// Positive eligibility classification is the only path to candidate bytes.
// Protected tasks bypass both finalizer arms entirely.
export function classifyTask(task) {
  if (task?.group === "eligible-prose") {
    return { group: task.group, classification: "eligible", candidateAllowed: true, bypassFinalizers: false };
  }
  if (task?.group === "protected-content") {
    return { group: task.group, classification: "protected", candidateAllowed: false, bypassFinalizers: true };
  }
  throw new Error(
    `Task '${task?.id ?? "unknown"}' has unknown group '${task?.group ?? "missing"}'; ` +
      "expected eligible-prose or protected-content.",
  );
}

// Finalizer prompt per arm. The candidate prompt is exactly the neutral off
// instruction plus the candidate contract, so the only differing bytes
// between finalizer arms are the contract itself. Protected tasks and the
// normal-off arm get no finalizer prompt at all.
export function finalizerPromptFor(arm, classification) {
  if (classification?.bypassFinalizers === true || classification?.candidateAllowed !== true) {
    return null;
  }
  if (arm === "shared-prefix-off") return SHARED_PREFIX_OFF_FINALIZER_PROMPT;
  if (arm === "shared-prefix-candidate") {
    return `${SHARED_PREFIX_OFF_FINALIZER_PROMPT} ${CANDIDATE_CONTRACT_V12}`;
  }
  throw new Error(`Unsupported finalizer arm '${String(arm)}'.`);
}

const USAGE_FIELDS = ["input", "cacheRead", "cacheWrite", "output"];

export function validUsage(usage) {
  return (
    usage !== null &&
    typeof usage === "object" &&
    USAGE_FIELDS.every((field) => Number.isFinite(usage[field]))
  );
}

function treeNodes({ parent, children = [], finalizer = null }) {
  return [parent, ...children, ...(finalizer === null ? [] : [finalizer])];
}

// Complete-tree tokens: the sum of provider-reported input, cache read,
// cache write, and output over the parent, every real child, and the
// arm's finalizer. One invalid field anywhere invalidates the total
// (fail-closed) instead of silently understating the arm.
export function sumCompleteTreeTokens(tree) {
  if (tree === null || typeof tree !== "object") return null;
  const nodes = treeNodes(tree);
  if (nodes.some((entry) => entry === null || entry === undefined)) return null;
  if (nodes.some((entry) => !validUsage(entry.usage))) return null;
  const totals = Object.fromEntries(
    USAGE_FIELDS.map((field) => [field, nodes.reduce((sum, entry) => sum + entry.usage[field], 0)]),
  );
  return { ...totals, total: USAGE_FIELDS.reduce((sum, field) => sum + totals[field], 0) };
}

// First-turn cache read for one node: the cache the provider reported for
// the node's very first model turn, not a session-wide total.
export function firstTurnCacheRead(entry) {
  const firstTurn = entry?.usageTurns?.[0];
  if (firstTurn !== undefined && Number.isFinite(firstTurn?.cacheRead)) {
    return firstTurn.cacheRead;
  }
  return Number.isFinite(entry?.usage?.cacheRead) ? entry.usage.cacheRead : null;
}

// Per-node cold/warm validation. Cold nodes must start with zero cached
// tokens; warm nodes must start with a positive cache read.
export function validateNodeCacheState(entry, expected) {
  const firstTurn = firstTurnCacheRead(entry);
  if (expected !== "cold" && expected !== "warm") {
    throw new Error(`Cache expectation must be 'cold' or 'warm', got '${String(expected)}'.`);
  }
  const ok =
    firstTurn !== null && (expected === "cold" ? firstTurn === 0 : firstTurn > 0);
  return {
    ok,
    expected,
    firstTurnCacheRead: firstTurn,
    reason: ok
      ? null
      : firstTurn === null
        ? "first-turn cache read missing"
        : `expected ${expected} first-turn cache read, got ${firstTurn}`,
  };
}

// Every exclusion is preserved with the full first-turn cache read vector
// of the arm's tree, so an excluded case still shows its cache evidence.
export function buildExclusion(tree, { arm, taskId, nodeId, reason }) {
  return {
    arm,
    taskId,
    nodeId,
    reason,
    firstTurnCacheReads: treeNodes(tree ?? {}).map(firstTurnCacheRead),
  };
}

// Regularized incomplete beta, evaluated with a fixed-iteration continued
// fraction (Numerical Recipes betacf/betai). Pure deterministic arithmetic:
// identical inputs always produce identical outputs across platforms.
function logGamma(z) {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = 0.99999999999980993;
  for (let index = 0; index < coefficients.length; index += 1) {
    x += coefficients[index] / (z + index + 1);
  }
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a, b, x) {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return h;
}

function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) +
    a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a;
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

function studentTCdf(t, degreesOfFreedom) {
  const x = degreesOfFreedom / (degreesOfFreedom + t * t);
  const p =
    0.5 *
    regularizedIncompleteBeta(x, degreesOfFreedom / 2, 0.5);
  return t > 0 ? 1 - p : p;
}

// Deterministic one-sided upper critical value: invert the Student t CDF
// with a fixed-tolerance bisection over a bounded interval.
export function tOneSidedCritical(confidence, degreesOfFreedom) {
  if (!(confidence > 0.5 && confidence < 1)) {
    throw new Error("Confidence must lie strictly between 0.5 and 1.");
  }
  if (!Number.isInteger(degreesOfFreedom) || degreesOfFreedom < 1) {
    throw new Error("Degrees of freedom must be a positive integer.");
  }
  let low = 0;
  let high = 100;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const mid = (low + high) / 2;
    if (studentTCdf(mid, degreesOfFreedom) < confidence) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

// Paired one-sided interval over per-task deltas. With fewer than two pairs
// the interval is null so the caller fails closed instead of dividing by a
// zero-degree-of-freedom estimate.
export function pairedUpperInterval(deltas, confidence = 0.95) {
  const values = [...(deltas ?? [])].filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const standardError = Math.sqrt(variance / n);
  const tCritical = tOneSidedCritical(confidence, n - 1);
  return {
    n,
    mean,
    standardError,
    tCritical,
    confidence,
    upperBound: mean + tCritical * standardError,
  };
}

// Release gates for the shared-prefix concise contract v12. Every gate must
// pass for the recommendation to leave `off`; any failure, missing interval,
// or unsupported claim keeps the mode off (fail closed).
export function evaluateSharedPrefixV12Gates({
  tokenUpper95,
  latencyUpper95,
  candidateSuccessCount,
  offSuccessCount,
  eligibleTaskCount,
  criticalFinalizerLosses,
  unsupportedClaims,
  protectedInjectionTokens,
  protectedSuccessEqual,
  protectedContentComplete,
  protectedExtraFinalizerWork,
}) {
  const successNonInferior =
    Number.isInteger(candidateSuccessCount) &&
    Number.isInteger(offSuccessCount) &&
    candidateSuccessCount >= offSuccessCount &&
    candidateSuccessCount >= eligibleTaskCount &&
    offSuccessCount >= eligibleTaskCount;
  const gates = {
    completeProductTokens:
      Number.isFinite(tokenUpper95) && tokenUpper95 < 0,
    completeProductLatency:
      Number.isFinite(latencyUpper95) && latencyUpper95 < 0,
    taskSuccessNonInferior: successNonInferior,
    zeroCriticalFinalizerLosses: criticalFinalizerLosses === 0,
    zeroUnsupportedClaims: unsupportedClaims === 0,
    protectedInjectionZero: protectedInjectionTokens === 0,
    protectedSuccessEqual: protectedSuccessEqual === true,
    protectedContentComplete: protectedContentComplete === true,
    protectedNoExtraFinalizerWork: protectedExtraFinalizerWork === 0,
  };
  const passed = Object.values(gates).every(Boolean);
  return {
    passed,
    gates,
    defaultMode: passed ? "shared-prefix-v12" : "off",
  };
}
