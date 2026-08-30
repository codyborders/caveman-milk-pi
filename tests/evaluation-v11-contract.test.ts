import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FINAL_RESPONSE_CONTRACT_V11, FINAL_RESPONSE_CONTRACT_V11_SHA256 } from "../src/final-response-contract.js";

describe("selective-final v11 contract", () => {
  it("imports deterministic contract data with protected exclusions", () => {
    const source = readFileSync("src/final-response-contract.json", "utf8");
    const document = JSON.parse(source);
    expect(document.version).toBe(11);
    expect(FINAL_RESPONSE_CONTRACT_V11.text).toBe(document.text);
    expect(FINAL_RESPONSE_CONTRACT_V11.characters).toBe(document.text.length);
    expect(createHash("sha256").update(document.text).digest("hex")).toBe(FINAL_RESPONSE_CONTRACT_V11_SHA256);
    for (const term of ["warnings", "confirmations", "uncertainty", "negation", "scope", "exact values", "ordered steps", "unfinished work", "code", "commands", "paths", "filenames", "quotations", "logs", "commits", "PR text", "docs", "files", "persisted artifacts", "delegation requests", "child responses"]) {
      expect(document.text.toLowerCase()).toContain(term.toLowerCase());
    }
  });
});
