// caveman-milk-pi injects compact, mode-specific rules into Pi's system prompt.
//
// session_start loads config and computes deterministic text. The hot
// before_agent_start path only appends cached bytes. Mode changes recompute the
// cache and persist schema-versioned config.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCavemanCommand } from "./src/command.js";
import { loadConfig, updateConfig } from "./src/config.js";
import { computeInjection } from "./src/injection.js";
import { FINAL_RESPONSE_CONTRACT_V11 as FINAL_RESPONSE_CONTRACT_V11_DATA } from "./src/final-response-contract.js";
import type { CavemanConfig, InjectionCache } from "./src/types.js";

export interface ExtensionDependencies {
  loadConfig: () => CavemanConfig;
  // Concurrent-safe write path; see updateConfig in src/config.ts.
  updateConfig: (mutator: (config: CavemanConfig) => CavemanConfig) => Promise<CavemanConfig>;
}

export const FINAL_RESPONSE_CONTRACT_V11 = FINAL_RESPONSE_CONTRACT_V11_DATA.text;

export function registerExtension(
  pi: ExtensionAPI,
  dependencies: ExtensionDependencies,
): void {
  let cache: InjectionCache | null = null;

  // Selective /caveman final activation: in-memory only, never persisted.
  // Arm captures the active tool list, empties active tools, and sends the
  // one request. before_agent_start consumes the armed flag exactly once.
  // Restore puts the exact captured list back and clears all state.
  let finalArmed = false;
  let finalRestoreTools: string[] | null = null;
  const restoreFinalTools = (): void => {
    finalArmed = false;
    const tools = finalRestoreTools;
    if (tools === null) return;
    finalRestoreTools = null;
    pi.setActiveTools(tools);
  };

  pi.on("session_start", async (_event, context) => {
    restoreFinalTools();
    const config = dependencies.loadConfig();
    cache = computeInjection(config.mode);
    if (config.showStatus) {
      context.ui.setStatus("caveman", `caveman: ${config.mode}`);
    } else {
      context.ui.setStatus("caveman", undefined);
    }
  });

  pi.on("before_agent_start", async (event) => {
    if (finalArmed) {
      // One-shot: clear before returning so only the armed request is hit.
      finalArmed = false;
      return { systemPrompt: event.systemPrompt + FINAL_RESPONSE_CONTRACT_V11_DATA.text };
    }
    if (cache === null || cache.mode === "off") return undefined;
    return { systemPrompt: event.systemPrompt + cache.text };
  });

  pi.on("agent_end", async () => {
    restoreFinalTools();
  });

  pi.on("session_shutdown", async () => {
    restoreFinalTools();
  });

  registerCavemanCommand(pi, {
    getCache: () => cache,
    setCache: (newCache) => {
      cache = newCache;
    },
    loadConfig: dependencies.loadConfig,
    update: dependencies.updateConfig,
    getFinalState: () => finalRestoreTools === null ? "idle" : "active",
    armFinal: (request) => {
      if (finalRestoreTools !== null) return "busy";
      finalRestoreTools = [...pi.getActiveTools()];
      // Arm before sending: before_agent_start can run synchronously inside
      // sendUserMessage, so the flag must already be visible then.
      finalArmed = true;
      pi.setActiveTools([]);
      try {
        pi.sendUserMessage(request);
      } catch {
        restoreFinalTools();
        return "failed";
      }
      return "started";
    },
  });
}

export default function cavemanMilkExtension(pi: ExtensionAPI): void {
  registerExtension(pi, { loadConfig, updateConfig });
}
