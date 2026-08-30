// Driver for checkpoint interruption tests. Runs the shared-prefix v12
// evaluation with a fake launcher. With --crash-after=N the process exits
// hard at the Nth launch, simulating an interrupted paid run. Prints a JSON
// summary: resumedLaunches, launchesThisRun, checkpointPath.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as runner from "../../scripts/eval/shared-prefix-v12-runner.mjs";

const crashAfter = Number(process.argv.find((arg) => arg.startsWith("--crash-after="))?.split("=")[1] ?? 0);
const checkpointArg = process.argv.find((arg) => arg.startsWith("--checkpoint="))?.split("=")[1];
const checkpointPath =
  checkpointArg ?? path.join(fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-ck-")), "checkpoint.json");

const fixtures = {
  version: 12,
  groups: [
    {
      id: "eligible-prose",
      classification: "eligible",
      tasks: [
        {
          id: "t1",
          kind: "comparison",
          prompt: "Compare. Cover throughput.",
          requiredFacts: ["throughput"],
          childTasks: ["c1"],
        },
      ],
    },
  ],
};

let launches = 0;
const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-ws-"));
const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-prefix-v12-cap-"));

try {
  const report = await runner.runSharedPrefixV12Evaluation({
    fixtures,
    provider: "pi",
    allowPaid: true,
    model: "test-model",
    maxPaidProcesses: 200,
    repetitions: 2,
    seed: "0x1",
    workspaceRoot,
    captureDir,
    checkpointPath,
    launchNode: async (request) => {
      launches += 1;
      if (crashAfter > 0 && launches === crashAfter) {
        process.exit(70);
      }
      const cacheRead = request.phase === "measured" ? 400 : 0;
      return {
        text: "covers throughput",
        usage: { input: 20, output: 8, cacheRead, cacheWrite: 4 },
        usageTurns: [{ input: 20, output: 8, cacheRead, cacheWrite: 4 }],
        rawEvents: [],
        elapsedMs: 500,
      };
    },
  });
  process.stdout.write(
    JSON.stringify({
      crashed: false,
      launchesThisRun: launches,
      resumedLaunches: report.checkpoint?.resumedLaunches ?? 0,
      checkpointPath,
    }),
  );
} catch (error) {
  process.stderr.write(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
}
