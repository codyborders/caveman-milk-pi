#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
    ["pack", "--silent", "--pack-destination", temporaryDirectory],
    root,
  );
  const tarballName = fs.readdirSync(temporaryDirectory).find((name) => name.endsWith(".tgz"));
  assert(tarballName !== undefined, `npm pack produced no tarball: ${packedOutput}`);
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

  await command("lite", { ui });
  const active = await beforeAgentStart({ systemPrompt: "base" });
  assert(active?.systemPrompt.includes("CAVEMAN MODE ACTIVE"), "Packed extension did not activate.");

  await command("off", { ui });
  assert(
    (await beforeAgentStart({ systemPrompt: "base" })) === undefined,
    "Packed extension did not disable.",
  );
  assert(notifications.length >= 2, "Packed extension command produced no activation diagnostics.");
  console.log("Packed tarball loaded through Pi extension loader; activation and disable passed.");
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
