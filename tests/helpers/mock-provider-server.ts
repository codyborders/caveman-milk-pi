// Shared mock Anthropic-compatible server harness for evaluation tests.
// No real provider request is made; requests stay on loopback.

import * as http from "node:http";
import * as evaluate from "../../scripts/evaluate.mjs";

export const fixtures = evaluate.loadFixtures();

export function createMockServer() {
  let server;
  let serverUrl;
  let requestLog = [];
  let failKeys = new Set();
  let judgeOverride = null;
  let caseOverride = null;

  function respondWithCase(response, parsed) {
    const metadata = JSON.parse(parsed.metadata?.user_id ?? "{}");
    if (failKeys.has(`${metadata.repetition}::${metadata.category}::${metadata.mode}`)) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "injected failure" }));
      return;
    }
    const isJudge =
      typeof parsed.system === "string" && parsed.system.includes("Blinded Quality Judge");
    if (isJudge) {
      const text =
        judgeOverride === null
          ? JSON.stringify({
              completeness: { A: 4, B: 4 },
              correctness: { A: 4, B: 4 },
              notes: "both equal",
            })
          : judgeOverride();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          content: [{ type: "text", text }],
          usage: { input_tokens: 30, output_tokens: 10 },
        }),
      );
      return;
    }
    const mode = metadata.mode ?? "off";
    const fallback = {
      text:
        mode === "off"
          ? "Do not delete backups. cache_key uses model identity."
          : "Do not delete backups. cache_key identity.",
      outputTokens: mode === "off" ? 40 : 20,
    };
    const outcome = caseOverride === null ? fallback : caseOverride(mode, metadata);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        content: [{ type: "text", text: outcome.text }],
        usage: {
          input_tokens: 100,
          output_tokens: outcome.outputTokens,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 25,
        },
      }),
    );
  }

  return {
    async start() {
      server = http.createServer((request, response) => {
        let body = "";
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          const parsed = JSON.parse(body);
          requestLog.push({ url: request.url, body: parsed });
          respondWithCase(response, parsed);
        });
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      serverUrl = `http://127.0.0.1:${server.address().port}/v1/messages`;
    },
    stop() {
      server.close();
    },
    url: () => serverUrl,
    requests: () => requestLog,
    requestCount: () => requestLog.length,
    fail(key) {
      failKeys.add(key);
    },
    clearFailures() {
      failKeys.clear();
    },
    setJudgeVerdict(override) {
      judgeOverride = override;
    },
    setCase(override) {
      caseOverride = override;
    },
  };
}

export function baseOptions(serverUrl, overrides = {}) {
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
