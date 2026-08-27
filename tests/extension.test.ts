// Extension tests exercise Pi lifecycle handlers with controlled config and persistence dependencies.

import { describe, expect, it, vi } from "vitest";
import { registerExtension } from "../index.js";
import type { CavemanConfig } from "../src/types.js";

function createPiHarness() {
  const handlers = new Map<string, (...args: never[]) => unknown>();
  const pi = {
    on: (name: string, handler: (...args: never[]) => unknown) => handlers.set(name, handler),
    registerCommand: vi.fn(),
  };
  return { handlers, pi };
}

describe("extension lifecycle", () => {
  it("does not inject before session initialization", async () => {
    const harness = createPiHarness();
    registerExtension(harness.pi as never, {
      loadConfig: () => ({ schemaVersion: 1, mode: "full", showStatus: true }),
      saveConfig: vi.fn(),
    });
    const beforeAgentStart = harness.handlers.get("before_agent_start");
    if (beforeAgentStart === undefined) throw new Error("handler was not registered");

    expect(await beforeAgentStart({ systemPrompt: "base" } as never)).toBeUndefined();
  });

  it("recomputes deterministic injection on every session start", async () => {
    const harness = createPiHarness();
    let config: CavemanConfig = { schemaVersion: 1, mode: "full", showStatus: true };
    const setStatus = vi.fn();
    registerExtension(harness.pi as never, {
      loadConfig: () => config,
      saveConfig: vi.fn(),
    });

    const sessionStart = harness.handlers.get("session_start");
    const beforeAgentStart = harness.handlers.get("before_agent_start");
    if (sessionStart === undefined || beforeAgentStart === undefined) {
      throw new Error("extension handlers were not registered");
    }

    await sessionStart({ reason: "startup" } as never, { ui: { setStatus } } as never);
    const active = await beforeAgentStart({ systemPrompt: "base" } as never);
    config = { ...config, mode: "off" };
    await sessionStart({ reason: "reload" } as never, { ui: { setStatus } } as never);
    const inactive = await beforeAgentStart({ systemPrompt: "base" } as never);

    expect(active).toMatchObject({ systemPrompt: expect.stringMatching(/^base\n\nCAVEMAN/) });
    expect(inactive).toBeUndefined();
  });
});
