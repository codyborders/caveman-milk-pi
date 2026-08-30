import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FINAL_RESPONSE_CONTRACT_V11 } from "../../src/final-response-contract.js";

export type SelectiveFinalArm = "off" | "selective-final-v11";

export function buildSelectiveFinalSystemPrompt(
  systemPrompt: string,
  arm: SelectiveFinalArm,
): string {
  if (arm === "off") return systemPrompt;
  if (arm === "selective-final-v11") {
    return systemPrompt + FINAL_RESPONSE_CONTRACT_V11.text;
  }
  throw new Error(`Unsupported selective final arm '${String(arm)}'.`);
}

export default function selectiveFinalEvaluationExtension(pi: ExtensionAPI): void {
  const arm = process.env.CAVEMAN_EVAL_FINAL_ARM;
  if (arm !== "off" && arm !== "selective-final-v11") {
    throw new Error(`CAVEMAN_EVAL_FINAL_ARM must be 'off' or 'selective-final-v11'.`);
  }
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: buildSelectiveFinalSystemPrompt(event.systemPrompt, arm),
  }));
}
