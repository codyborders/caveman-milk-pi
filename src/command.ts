// /caveman slash command: display status or switch mode.
//
// Mode changes are the only prompt-cache invalidation trigger.
// A change takes effect on the next before_agent_start call.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CavemanConfig, CavemanMode, InjectionCache } from "./types.js";
import { VALID_MODES } from "./types.js";
import { validateMode } from "./config.js";
import { computeInjection } from "./injection.js";

export interface CommandDeps {
  getCache: () => InjectionCache | null;
  setCache: (cache: InjectionCache) => void;
  loadConfig: () => CavemanConfig;
  // Locked, concurrent-safe update: reloads latest config, applies exactly
  // one field-level change, saves atomically, releases its own lock.
  update: (mutator: (config: CavemanConfig) => CavemanConfig) => Promise<CavemanConfig>;
}

export function registerCavemanCommand(pi: ExtensionAPI, deps: CommandDeps): void {
  pi.registerCommand("caveman", {
    description:
      "Toggle caveman terseness mode. Usage: /caveman [off|lite|full|ultra|wenyan|wenyan-lite|wenyan-ultra|status on|status off|diff]",
    handler: async (args, ctx) => {
      const trimmed = (args ?? "").trim();

      if (trimmed.length === 0) {
        const current = deps.getCache();
        const mode = current?.mode ?? "off";
        const showStatus = deps.loadConfig().showStatus;
        ctx.ui.notify(
          `caveman: ${mode} (statusbar: ${showStatus ? "on" : "off"}). ` +
            `Run /caveman <mode> to change. Valid: ${VALID_MODES.join(", ")}. ` +
            `Statusbar: /caveman status on|off. Diagnostic: /caveman diff`,
          "info",
        );
        return;
      }

      if (trimmed.startsWith("status")) {
        const arg = trimmed.substring("status".length).trim();
        if (arg !== "on" && arg !== "off") {
          ctx.ui.notify(
            `caveman: invalid status arg '${arg}'. Usage: /caveman status on|off`,
            "warning",
          );
          return;
        }
        const show = arg === "on";
        const updated = await deps.update((config) => ({ ...config, showStatus: show }));
        if (show) {
          const current = deps.getCache();
          const mode = current?.mode ?? updated.mode;
          ctx.ui.setStatus("caveman", `caveman: ${mode}`);
        } else {
          ctx.ui.setStatus("caveman", undefined);
        }
        ctx.ui.notify(
          show
            ? "caveman statusbar on."
            : "caveman statusbar off. Mode unchanged — /caveman to check.",
          "info",
        );
        return;
      }

      // Show the exact cached text that the next model request will receive.
      if (trimmed === "diff") {
        const current = deps.getCache();
        if (!current) {
          ctx.ui.notify(
            "caveman: cache not initialized. Run /reload or restart pi.",
            "warning",
          );
          return;
        }
        const text = current.text.length === 0 ? "(mode=off — no injection)" : current.text;
        const info =
          `=== caveman-milk-pi injection diagnostic ===\n` +
          `mode: ${current.mode}\n` +
          `hash: ${current.sourceHash}\n` +
          `length: ${current.text.length} chars\n` +
          `approximate tokens: ${Math.ceil(current.text.length / 4)}\n` +
          `--- injection text ---\n${text}\n--- end ---`;
        ctx.ui.notify(info, "info");
        return;
      }

      // Invalid modes throw and surface through Pi's extension error handling.
      const newMode: CavemanMode = validateMode(trimmed);
      const updated = await deps.update((config) => ({ ...config, mode: newMode }));

      const newCache = computeInjection(newMode);
      deps.setCache(newCache);

      if (updated.showStatus) {
        ctx.ui.setStatus("caveman", `caveman: ${newMode}`);
      }
      ctx.ui.notify(
        newMode === "off"
          ? "caveman off. Next turn: normal output."
          : `caveman: ${newMode}. Takes effect on next message.`,
        "info",
      );
    },
  });
}
