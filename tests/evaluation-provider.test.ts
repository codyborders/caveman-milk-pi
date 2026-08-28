// Provider evaluation orchestration tests against a local mock Anthropic-
// compatible server. No real provider request is made.

import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as evaluate from "../scripts/evaluate.mjs";

const fixtures = evaluate.loadFixtures();

let server;
let serverUrl;
let requestLog;
let failKeys;
let handler;

beforeEach(async () => {
  requestLog = [];
  failKeys = new Set();
  handler = null;
  server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const parsed = JSON.parse(body);
      requestLog.push({ url: request.url, body: parsed });
      if (handler !== null) {
        handler(request, response, parsed);
        return;
      }
      respondWithCase(response, parsed);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}/v1/messages`;
});

afterEach(() => {
  server.close();
});

function respondWithCase(response, parsed) {
  const metadata = JSON.parse(parsed.metadata?.user_id ?? "{}");
  if (failKeys.has(`${metadata.repetition}::${metadata.category}::${metadata.mode}`)) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "injected failure" }));
    return;
  }
  const isJudge = typeof parsed.system === "string" && parsed.system.includes("Blinded Quality Judge");
  if (isJudge) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              completeness: { A: 4, B: 4 },
              correctness: { A: 4, B: 4 },
              groundedness: { A: 4, B: 4 },
              notes: "both equal",
            }),
          },
        ],
        usage: { input_tokens: 30, output_tokens: 10 },
      }),
    );
    return;
  }
  const mode = metadata.mode ?? "off";
  const text =
    mode === "off"
      ? "Do not delete backups. cache_key uses model identity."
      : "Do not delete backups. cache_key identity.";
  const outputTokens = mode === "off" ? 40 : 20;
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      content: [{ type: "text", text }],
      usage: {
        input_tokens: 100,
        output_tokens: outputTokens,
        cache_creation_input_tokens: 50,
        cache_read_input_tokens: 25,
      },
    }),
  );
}

function baseOptions(overrides = {}) {
  return {
    apiKey: "test-key",
    model: "test-model",
    allowPaid: true,
    endpoint: serverUrl,
    fixtures,
    modes: ["off", "full"],
    categories: ["technical-explanation"],
    repetitions: 3,
    seed: "0xa1b2c3d4",
    execGit: () => "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    readPiVersion: () => "0.84.3",
    sleepImpl: async () => {},
    ...overrides,
  };
}

describe("provider validation and selection guards", () => {
  it("rejects an unsupported provider name before any request", async () => {
    await expect(
      evaluate.runProviderEvaluation(baseOptions({ provider: "openai" })),
    ).rejects.toThrow(/Unsupported CAVEMAN_EVAL_PROVIDER 'openai'/);
    expect(requestLog.length).toBe(0);
  });
});
