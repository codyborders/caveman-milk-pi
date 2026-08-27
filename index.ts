// caveman-milk-pi injects compact, mode-specific rules into Pi's system prompt.
//
// session_start loads config and computes deterministic text. The hot
// before_agent_start path only appends cached bytes. Mode changes recompute the
// cache and persist schema-versioned config.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCavemanCommand } from "./src/command.js";
import { loadConfig, saveConfig } from "./src/config.js";
import { computeInjection } from "./src/injection.js";
import type { CavemanConfig, InjectionCache } from "./src/types.js";

export interface ExtensionDependencies {
  loadConfig: () => CavemanConfig;
  saveConfig: (config: CavemanConfig) => void;
}

export function registerExtension(
  pi: ExtensionAPI,
  dependencies: ExtensionDependencies,
): void {
  let cache: InjectionCache | null = null;

  pi.on("session_start", async (_event, context) => {
    const config = dependencies.loadConfig();
    cache = computeInjection(config.mode);
    if (config.showStatus) {
      context.ui.setStatus("caveman", `caveman: ${config.mode}`);
    } else {
      context.ui.setStatus("caveman", undefined);
    }
  });

  pi.on("before_agent_start", async (event) => {
    if (cache === null || cache.mode === "off") return undefined;
    return { systemPrompt: event.systemPrompt + cache.text };
  });

  registerCavemanCommand(pi, {
    getCache: () => cache,
    setCache: (newCache) => {
      cache = newCache;
    },
    loadConfig: dependencies.loadConfig,
    persist: dependencies.saveConfig,
  });
}

export default function cavemanMilkExtension(pi: ExtensionAPI): void {
  registerExtension(pi, { loadConfig, saveConfig });
}
