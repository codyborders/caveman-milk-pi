// Selective final-response activation tests exercise the public extension and
// command boundaries for /caveman final.

import { describe, expect, it, vi } from "vitest";
import { registerExtension } from "../index.js";
import type { CavemanConfig } from "../src/types.js";

const DEFAULT_TOOLS = ["read", "bash", "edit", "write"] as const;

interface HarnessOptions {
  config?: CavemanConfig;
  activeTools?: readonly string[];
  sendUserMessage?: (content: string) => unknown;
}

function createHarness(options: HarnessOptions = {}) {
  const handlers = new Map<string, (event: never, context?: never) => unknown>();
  let activeTools = [...(options.activeTools ?? DEFAULT_TOOLS)];
  const sendUserMessage = vi.fn(options.sendUserMessage ?? ((_content: string) => undefined));
  const getActiveTools = vi.fn(() => [...activeTools]);
  const setActiveTools = vi.fn((names: string[]) => {
    activeTools = [...names];
  });
  const notify = vi.fn();
  const setStatus = vi.fn();
  const updateConfig = vi.fn();
  const config: CavemanConfig =
    options.config ?? { schemaVersion: 1, mode: "off", showStatus: true };

  const pi = {
    on: (name: string, handler: (event: never, context?: never) => unknown) => {
      handlers.set(name, handler);
    },
    registerCommand: vi.fn(),
    getActiveTools,
    setActiveTools,
    sendUserMessage,
  };

  registerExtension(pi as never, {
    loadConfig: () => config,
    updateConfig,
  });

  const registration = pi.registerCommand.mock.calls[0]?.[1] as
    | { handler: (args: string, ctx: unknown) => Promise<void> }
    | undefined;
  if (registration === undefined) throw new Error("command was not registered");

  const runCommand = (args: string, ctxOptions: { isIdle?: () => boolean } = {}) =>
    registration.handler(args, {
      ui: { notify, setStatus },
      isIdle: ctxOptions.isIdle ?? (() => true),
    });

  async function fire(name: string, event: unknown, context?: unknown) {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`handler ${name} was not registered`);
    return handler(event as never, context as never);
  }

  const beforeAgentStart = (systemPrompt: string) =>
    fire("before_agent_start", { type: "before_agent_start", systemPrompt });
  const agentEnd = () => fire("agent_end", { type: "agent_end", messages: [] });
  const sessionShutdown = () => fire("session_shutdown", { type: "session_shutdown" });
  const sessionStart = () =>
    fire("session_start", { type: "session_start" }, { ui: { setStatus } });

  return {
    runCommand,
    beforeAgentStart,
    agentEnd,
    sessionShutdown,
    sessionStart,
    notify,
    setStatus,
    updateConfig,
    sendUserMessage,
    setActiveTools,
    activeTools: () => [...activeTools],
    config,
  };
}

describe("/caveman final selective activation", () => {
  it("returns usage without activating when the request is empty", async () => {
    const h = createHarness();
    await h.runCommand("final");
    expect(h.sendUserMessage).not.toHaveBeenCalled();
    expect(h.activeTools()).toEqual([...DEFAULT_TOOLS]);
    expect(await h.beforeAgentStart("base")).toBeUndefined();
    const message = String(h.notify.mock.calls.at(-1)?.[0]);
    expect(message).toMatch(/\/caveman final/);
    expect(h.notify.mock.calls.at(-1)?.[1]).toBe("warning");
  });

  it("rejects activation unless persisted mode is off", async () => {
    const h = createHarness({
      config: { schemaVersion: 1, mode: "lite", showStatus: true },
    });
    await h.runCommand("final explain reducers");
    expect(h.sendUserMessage).not.toHaveBeenCalled();
    expect(h.activeTools()).toEqual([...DEFAULT_TOOLS]);
    expect(String(h.notify.mock.calls.at(-1)?.[0])).toContain("requires mode off");
  });

  it("rejects activation while another agent response is active", async () => {
    const h = createHarness();
    await h.runCommand("final explain reducers", { isIdle: () => false });
    expect(h.sendUserMessage).not.toHaveBeenCalled();
    expect(h.activeTools()).toEqual([...DEFAULT_TOOLS]);
    expect(String(h.notify.mock.calls.at(-1)?.[0])).toContain("wait for the current response");
  });

  it("sends exactly one user message with the exact request text", async () => {
    const h = createHarness();
    await h.runCommand("final explain reducers");
    expect(h.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(h.sendUserMessage).toHaveBeenCalledWith("explain reducers");
  });

  it("rejects overlapping final activations without replacing captured tools", async () => {
    const h = createHarness();
    await h.runCommand("final first response");
    await h.runCommand("final second response");
    expect(h.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(h.activeTools()).toEqual([]);
    expect(String(h.notify.mock.calls.at(-1)?.[0])).toContain("already active");
    await h.agentEnd();
    expect(h.activeTools()).toEqual([...DEFAULT_TOOLS]);
  });

  it("restores tools when sending the one-response request fails", async () => {
    const h = createHarness({
      sendUserMessage: () => {
        throw new Error("send failed");
      },
    });
    await expect(h.runCommand("final audit")).resolves.toBeUndefined();
    expect(h.activeTools()).toEqual([...DEFAULT_TOOLS]);
    expect(String(h.notify.mock.calls.at(-1)?.[0])).toContain("could not start");
    expect(await h.beforeAgentStart("base")).toBeUndefined();
  });

  it("restores tools when the session shuts down during activation", async () => {
    const h = createHarness();
    await h.runCommand("final audit");
    expect(h.activeTools()).toEqual([]);
    await h.sessionShutdown();
    expect(h.activeTools()).toEqual([...DEFAULT_TOOLS]);
    expect(await h.beforeAgentStart("base")).toBeUndefined();
  });

  it("reports transient final activation separately from persisted mode", async () => {
    const h = createHarness();
    await h.runCommand("final audit");
    await h.runCommand("");
    expect(String(h.notify.mock.calls.at(-1)?.[0])).toContain("final response: active");
    expect(h.config.mode).toBe("off");
    await h.agentEnd();
    await h.runCommand("");
    expect(String(h.notify.mock.calls.at(-1)?.[0])).toContain("final response: idle");
  });

  it("restores tools if a new session starts before completion", async () => {
    const h = createHarness();
    await h.runCommand("final audit");
    expect(h.activeTools()).toEqual([]);
    await h.sessionStart();
    expect(h.activeTools()).toEqual([...DEFAULT_TOOLS]);
    expect(await h.beforeAgentStart("base")).toBeUndefined();
  });

  it("captures active tools, empties them, and restores the exact list after agent_end", async () => {
    const h = createHarness();
    await h.runCommand("final audit");
    expect(h.setActiveTools).toHaveBeenCalledWith([]);
    expect(h.activeTools()).toEqual([]);
    await h.beforeAgentStart("base");
    await h.agentEnd();
    expect(h.activeTools()).toEqual([...DEFAULT_TOOLS]);
  });

  it("injects the v11 prompt once and leaves the next request unchanged", async () => {
    const h = createHarness();
    await h.runCommand("final explain reducers");
    const activated = await h.beforeAgentStart("base");
    expect(activated).toBeDefined();
    expect(activated?.systemPrompt).toMatch(/^base/);
    expect(activated?.systemPrompt).toContain("v11");
    expect(activated?.systemPrompt).not.toContain("CAVEMAN MODE ACTIVE");
    for (const protectedTerm of [
      "safety warnings",
      "confirmations",
      "uncertainty",
      "negation",
      "scope",
      "exact values",
      "ordered steps",
      "unfinished work",
      "code",
      "commands",
      "paths",
      "filenames",
      "commit text",
      "PR text",
      "documentation",
      "persisted artifacts",
      "Delegation requests",
      "child-agent responses",
    ]) {
      expect(activated?.systemPrompt).toContain(protectedTerm);
    }
    expect(h.updateConfig).not.toHaveBeenCalled();
    expect(h.config.mode).toBe("off");
    const next = await h.beforeAgentStart("base two");
    expect(next).toBeUndefined();
  });
});
