#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const npmCommand = "npm";
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "caveman-packed-smoke-"));
const homeDirectory = path.join(temporaryDirectory, "home");
fs.mkdirSync(homeDirectory, { recursive: true });

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${String(result.status)}\n` +
        `${result.error?.message ?? ""}\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result.stdout.trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const packedOutput = run(
    npmCommand,
    ["pack", "--json", "--pack-destination", temporaryDirectory],
    root,
  );
  let packedMetadata;
  try {
    packedMetadata = JSON.parse(packedOutput)[0];
  } catch (error) {
    throw new Error(`npm pack returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const tarballName = packedMetadata?.filename;
  assert(typeof tarballName === "string", `npm pack produced no tarball: ${packedOutput}`);
  const packedEntries = (packedMetadata.files ?? []).map((entry) => entry.path);
  assert(!packedEntries.some((entry) => entry.startsWith("evaluation/")), "Packed tarball includes evaluation material.");
  assert(!packedEntries.some((entry) => entry.startsWith("scripts/")), "Packed tarball includes scripts.");
  assert(!packedEntries.some((entry) => /audit/i.test(entry)), "Packed tarball includes audit records.");
  const environment = { ...process.env, HOME: homeDirectory, USERPROFILE: homeDirectory };

  run(npmCommand, ["init", "--yes"], temporaryDirectory, environment);
  run(
    npmCommand,
    [
      "install",
      "--ignore-scripts",
      "--no-save",
      "--package-lock=false",
      path.join(temporaryDirectory, tarballName),
      "@earendil-works/pi-coding-agent@0.84.3",
    ],
    temporaryDirectory,
    environment,
  );

  process.env.HOME = homeDirectory;
  process.env.USERPROFILE = homeDirectory;
  const piMain = path.join(
    temporaryDirectory,
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
    "dist",
    "index.js",
  );
  assert(fs.existsSync(piMain), `Pi package is not installed at ${piMain}.`);
  const loaderPath = path.join(path.dirname(piMain), "core", "extensions", "loader.js");
  const { loadExtensions } = await import(pathToFileURL(loaderPath).href);
  const extensionPath = path.join(
    temporaryDirectory,
    "node_modules",
    "@codyborders",
    "caveman-milk-pi",
    "index.ts",
  );
  const loaded = await loadExtensions([extensionPath], temporaryDirectory);
  assert(loaded.errors.length === 0, `Pi extension loader errors: ${JSON.stringify(loaded.errors)}`);
  assert(loaded.extensions.length === 1, "Pi extension loader did not load packed extension.");

  const extension = loaded.extensions[0];
  const sessionStart = extension.handlers.get("session_start")?.[0];
  const beforeAgentStart = extension.handlers.get("before_agent_start")?.[0];
  const command = extension.commands.get("caveman")?.handler;
  assert(sessionStart !== undefined, "Packed extension did not register session_start.");
  assert(beforeAgentStart !== undefined, "Packed extension did not register before_agent_start.");
  assert(command !== undefined, "Packed extension did not register caveman command.");

  const notifications = [];
  const ui = {
    notify: (message) => notifications.push(message),
    setStatus: () => {},
  };
  await sessionStart({ reason: "startup" }, { ui });
  assert(
    (await beforeAgentStart({ systemPrompt: "base" })) === undefined,
    "Packed extension injected prompt before activation.",
  );

  const activeModes = ["lite", "full", "ultra", "wenyan-lite", "wenyan", "wenyan-ultra"];
  for (const mode of activeModes) {
    await command(mode, { ui });
    const active = await beforeAgentStart({ systemPrompt: "base" });
    const label = mode === "wenyan" ? "wenyan-full" : mode;
    assert(
      active?.systemPrompt.includes(`CAVEMAN MODE ACTIVE — level: ${label}`),
      `Packed extension did not inject prompt for ${mode}.`,
    );
  }

  await command("off", { ui });
  assert(
    (await beforeAgentStart({ systemPrompt: "base" })) === undefined,
    "Packed extension did not disable.",
  );

  const packageRoot = path.join(temporaryDirectory, "node_modules", "@codyborders", "caveman-milk-pi");
  const skillPath = path.join(packageRoot, "skill", "SKILL.md");
  const originalSkill = fs.readFileSync(skillPath, "utf8");
  const injectionSourcePath = path.join(packageRoot, "src", "injection.ts");
  const compiledInjectionPath = path.join(packageRoot, "src", `.injection-smoke-${process.pid}.mjs`);
  try {
    const compiledInjection = ts.transpileModule(fs.readFileSync(injectionSourcePath, "utf8"), {
      fileName: injectionSourcePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: true,
      },
    }).outputText;
    fs.writeFileSync(compiledInjectionPath, compiledInjection, "utf8");
    const injection = await import(`${pathToFileURL(compiledInjectionPath).href}?smoke=${Date.now()}`);
    const recovery = "Reinstall the extension or restore skill/SKILL.md from the package.";
    for (const [label, replacement] of [["missing", null], ["empty", ""], ["malformed", "# malformed\n"]]) {
      if (replacement === null) fs.rmSync(skillPath);
      else fs.writeFileSync(skillPath, replacement, "utf8");
      try {
        injection.loadSkillContent();
        throw new Error(`Packed ${label} SKILL.md did not fail.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert(message.includes(recovery), `Packed ${label} recovery omitted packaged action.`);
        assert(!message.includes("scripts/sync-skill.sh"), `Packed ${label} recovery mentions removed sync script.`);
      } finally {
        fs.writeFileSync(skillPath, originalSkill, "utf8");
      }
    }
  } finally {
    fs.rmSync(compiledInjectionPath, { force: true });
  }
  assert(fs.readFileSync(skillPath, "utf8") === originalSkill, "Packed skill file was not restored.");
  assert(notifications.length >= activeModes.length + 1, "Packed extension command produced no diagnostics.");
  console.log("recovery checks: missing, empty, malformed; tarball excludes evaluation and scripts");
  console.log(`Packed tarball loaded through Pi extension loader; active modes: ${activeModes.join(", ")}; off inert.`);
} finally {
  try {
    fs.rmSync(temporaryDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  } catch (error) {
    if (process.platform !== "win32" || error?.code !== "EPERM") throw error;
    process.stderr.write(`Temporary smoke directory remained locked: ${temporaryDirectory}\n`);
  }
}
