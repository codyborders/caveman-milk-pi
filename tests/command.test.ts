// Command tests exercise mode changes, status control, and diagnostics through the registered slash-command handler.

import { describe, expect, it, vi } from "vitest";
import { registerCavemanCommand } from "../src/command.js";
import type { CavemanConfig, InjectionCache } from "../src/types.js";

function createHarness(initialConfig: CavemanConfig) {
  let handler: ((args: string, context: unknown) => Promise<void>) | undefined;
  let cache: InjectionCache | null = null;
  let config = initialConfig;
  const notify = vi.fn();
  const setStatus = vi.fn();
  const persist = vi.fn((nextConfig: CavemanConfig) => {
    config = nextConfig;
  });
  const pi = {
    registerCommand: (_name: string, command: { handler: typeof handler }) => {
      handler = command.handler;
    },
  };

  registerCavemanCommand(pi as never, {
    getCache: () => cache,
    setCache: (nextCache) => {
      cache = nextCache;
    },
    loadConfig: () => config,
    persist,
  });

  return {
    run: async (args: string) => {
      if (handler === undefined) throw new Error("command handler was not registered");
      await handler(args, { ui: { notify, setStatus } });
    },
    getCache: () => cache,
    notify,
    persist,
    setStatus,
  };
}

describe("/caveman", () => {
  it("persists and activates a selected mode", async () => {
    const harness = createHarness({ schemaVersion: 1, mode: "off", showStatus: true });

    await harness.run("full");

    expect(harness.persist).toHaveBeenCalledWith({
      schemaVersion: 1,
      mode: "full",
      showStatus: true,
    });
    expect(harness.getCache()?.mode).toBe("full");
    expect(harness.setStatus).toHaveBeenCalledWith("caveman", "caveman: full");
  });

  it("does not activate a mode when persistence fails", async () => {
    const harness = createHarness({ schemaVersion: 1, mode: "off", showStatus: true });
    harness.persist.mockImplementationOnce(() => {
      throw new Error("write failed");
    });

    await expect(harness.run("full")).rejects.toThrow("write failed");
    expect(harness.getCache()).toBeNull();
    expect(harness.setStatus).not.toHaveBeenCalled();
  });

  it("changes footer visibility without changing mode", async () => {
    const harness = createHarness({ schemaVersion: 1, mode: "ultra", showStatus: true });

    await harness.run("status off");

    expect(harness.persist).toHaveBeenCalledWith({
      schemaVersion: 1,
      mode: "ultra",
      showStatus: false,
    });
    expect(harness.setStatus).toHaveBeenCalledWith("caveman", undefined);
  });

  it("reports injection length and approximate token burden", async () => {
    const harness = createHarness({ schemaVersion: 1, mode: "off", showStatus: true });
    await harness.run("lite");

    await harness.run("diff");

    const message = String(harness.notify.mock.calls.at(-1)?.[0]);
    expect(message).toMatch(/length: \d+ chars/);
    expect(message).toMatch(/approximate tokens: \d+/);
  });
});
