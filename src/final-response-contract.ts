import { createHash } from "node:crypto";
import contract from "./final-response-contract.json" with { type: "json" };

export interface FinalResponseContractV11 {
  readonly version: 11;
  readonly text: string;
  readonly characters: number;
  readonly exclusions: readonly string[];
}

const text = contract.text;

export const FINAL_RESPONSE_CONTRACT_V11: FinalResponseContractV11 = Object.freeze({
  version: 11,
  text,
  characters: text.length,
  exclusions: contract.exclusions,
});

export const FINAL_RESPONSE_CONTRACT_V11_SHA256 = createHash("sha256")
  .update(text)
  .digest("hex");
