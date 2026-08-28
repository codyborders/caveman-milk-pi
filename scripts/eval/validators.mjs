// Deterministic response validators for the provider evaluation harness.
//
// Every validator is pure: given response text, a config object, and a call
// context it returns a pass/fail check without any model access. Unknown
// validator ids fail closed so a fixture typo can never pass silently.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * @typedef {{ id: string }} ValidatorConfig
 * @typedef {{ toolCall: { name: string, input: Record<string, unknown> } | null, expectsTool: boolean, requiredTerms?: string[] }} ValidatorContext
 * @typedef {{ id: string, passed: boolean, detail: string }} ValidatorCheck
 * @typedef {{ passed: boolean, checks: ValidatorCheck[] }} ValidationOutcome
 */

const VALIDATORS = {
  "exact-negation": (text, config, _context) => {
    const sentence = String(config.sentence ?? "");
    const core = String(config.core ?? "");
    if (sentence.length === 0 || core.length === 0) {
      throw new Error("exact-negation requires 'sentence' and 'core' options.");
    }
    const normalize = (value) => value.replace(/\s+/g, " ");
    const normalizedText = normalize(text);
    if (!normalizedText.includes(normalize(sentence))) {
      return {
        id: "exact-negation",
        passed: false,
        detail: `negated sentence ${JSON.stringify(sentence)} is missing or altered.`,
      };
    }
    // Every occurrence of the affirmative core must sit inside a negated
    // phrase, otherwise the response both forbids and permits the action.
    const negationWindow = 24;
    const negationPattern = /\b(not|never|no|cannot|can't|dont|don't|avoid|forbid|forbidden|prohibit|prohibited|refrain)\b/i;
    let searchFrom = 0;
    while (searchFrom <= normalizedText.length - core.length) {
      const index = normalizedText.indexOf(core, searchFrom);
      if (index === -1) break;
      const before = normalizedText.substring(Math.max(0, index - negationWindow), index);
      if (!negationPattern.test(before)) {
        return {
          id: "exact-negation",
          passed: false,
          detail: `affirmative '${core}' appears without a negation guard near offset ${index}.`,
        };
      }
      searchFrom = index + core.length;
    }
    return {
      id: "exact-negation",
      passed: true,
      detail: `negated sentence retained and '${core}' always negated.`,
    };
  },
  "numbered-order": (text, config, _context) => {
    const count = Number(config.count);
    if (!Number.isInteger(count) || count < 1) {
      throw new Error("numbered-order requires a positive integer 'count' option.");
    }
    const itemMatches = [...text.matchAll(/^\s{0,3}(\d+)[.)]\s+([^\n]*)/gm)];
    const items = itemMatches.map((match) => Number.parseInt(match[1] ?? "0", 10));
    if (items.length !== count) {
      return {
        id: "numbered-order",
        passed: false,
        detail: `expected ${count} numbered steps, found ${items.length}.`,
      };
    }
    const inOrder = items.every((value, index) => value === index + 1);
    const orderedTerms = Array.isArray(config.orderedTerms) ? config.orderedTerms.map(String) : [];
    const termsInOrder = orderedTerms.length === 0 || (
      orderedTerms.length === count &&
      orderedTerms.every((term, index) =>
        String(itemMatches[index]?.[2] ?? "").toLowerCase().includes(term.toLowerCase()),
      )
    );
    return {
      id: "numbered-order",
      passed: inOrder && termsInOrder,
      detail: !inOrder
        ? `numbered steps must read 1..${count} ascending; found ${items.join(", ")}.`
        : !termsInOrder
          ? `numbered steps must retain this term order: ${orderedTerms.join(", ")}.`
          : `found ${count} steps numbered 1..${count} in ascending order.`,
    };
  },
  "exact-value": (text, config, _context) => {
    const expected = String(config.value ?? "");
    if (expected.length === 0) {
      throw new Error("exact-value requires a non-empty 'value' option.");
    }
    const actual = String(text).trim();
    return {
      id: "exact-value",
      passed: actual === expected,
      detail: actual === expected
        ? `response exactly matches ${JSON.stringify(expected)}.`
        : `response must exactly match ${JSON.stringify(expected)}.`,
    };
  },
  terms: (text, config, context) => {
    const required = config.requiredTerms ?? context.requiredTerms ?? [];
    const missing = required.filter((term) => !text.includes(term));
    return {
      id: "terms",
      passed: missing.length === 0,
      detail:
        missing.length === 0
          ? `all ${required.length} required terms retained`
          : `missing required terms: ${missing.map((term) => JSON.stringify(term)).join(", ")}`,
    };
  },
  "groundedness": (text, config, context) => {
    const expected = String(config.expected ?? "clarification");
    if (expected !== "clarification") {
      throw new Error("groundedness requires expected='clarification'.");
    }
    const normalized = String(text).toLowerCase();
    const asksForContext = /\b(need|provide|share|supply|missing|cannot|can't|unable|insufficient|not enough|unavailable|clarif)/i.test(normalized);
    const hasUnsupportedSpecificity =
      /\b(option\s+[ab]).{0,80}\b(?:is|costs|takes|faster|slower|better|worse)\b.{0,50}\d+(?:%|\s*(?:ms|seconds?|gb|mb))?/i.test(text) ||
      /\boption\s+[ab]\s+(?:is|seems|performs)\b.{0,40}\b(?:better|worse|faster|slower|cheaper|safer|reliable)\b/i.test(text) ||
      /\b(?:latency|price|cost|throughput|accuracy)\s*(?:is|=|:)??\s*\d/i.test(text);
    const taskPrompt = String(context.taskPrompt ?? "").toLowerCase();
    const underSpecified = config.underSpecified === true || /(?:no|without|missing).*(?:fact|detail|value|context|data)/i.test(taskPrompt);
    const passed = underSpecified && asksForContext && !hasUnsupportedSpecificity;
    return {
      id: "groundedness",
      passed,
      detail: !underSpecified
        ? "groundedness clarification check requires an under-specified task."
        : hasUnsupportedSpecificity
          ? "response contains unsupported concrete specificity."
          : asksForContext
            ? "response requests missing context without inventing facts."
            : "response should request missing context instead of asserting unsupported facts.",
    };
  },
  "warning-prose": (text, config, _context) => {
    const marker = String(config.marker ?? "");
    const minWords = Number(config.minWords ?? 8);
    if (marker.length === 0) {
      throw new Error("warning-prose requires a non-empty 'marker' option.");
    }
    const markerIndex = text.indexOf(marker);
    if (markerIndex === -1) {
      return {
        id: "warning-prose",
        passed: false,
        detail: `warning marker ${JSON.stringify(marker)} is missing.`,
      };
    }
    const sentenceEnders = [".", "!", "?", "。", "！", "？"];
    const before = text.substring(0, markerIndex);
    let sentenceStart = 0;
    for (const ender of sentenceEnders) {
      const at = before.lastIndexOf(ender);
      if (at + 1 > sentenceStart) sentenceStart = at + 1;
    }
    const afterEnd = text.substring(markerIndex + marker.length);
    let endOffset = -1;
    for (const ender of sentenceEnders) {
      const at = afterEnd.indexOf(ender);
      if (at !== -1 && (endOffset === -1 || at < endOffset)) endOffset = at;
    }
    if (endOffset === -1) {
      return {
        id: "warning-prose",
        passed: false,
        detail: `sentence containing ${JSON.stringify(marker)} has no terminal punctuation.`,
      };
    }
    const sentence = text.substring(sentenceStart, markerIndex + marker.length + endOffset + 1);
    const words = countWords(sentence);
    if (words < minWords) {
      return {
        id: "warning-prose",
        passed: false,
        detail: `warning sentence too short: ${words} words, need ${minWords}.`,
      };
    }
    const requiredTerms = Array.isArray(config.requiredTerms)
      ? config.requiredTerms.map((term) => String(term).toLowerCase())
      : [];
    const normalizedText = String(text).toLowerCase();
    const missingTerms = requiredTerms.filter((term) => !normalizedText.includes(term));
    if (missingTerms.length > 0) {
      return {
        id: "warning-prose",
        passed: false,
        detail: `warning response is missing required safety content: ${missingTerms.join(", ")}.`,
      };
    }
    return {
      id: "warning-prose",
      passed: true,
      detail: `warning marker present in a ${words}-word prose sentence.`,
    };
  },
  "confirmation-language": (text, config, _context) => {
    const phrase = String(config.phrase ?? "");
    if (phrase.length === 0) {
      throw new Error("confirmation-language requires a non-empty 'phrase' option.");
    }
    const asksConfirmation =
      text.includes(phrase) &&
      (text.includes("?") || /\b(confirm|approve|approval)\b[^.!?]*(?:before|proceed|delete|remove|act)/i.test(text)) &&
      /\b(confirm|approve|approval|proceed|permission|yes)\b/i.test(text);
    return {
      id: "confirmation-language",
      passed: asksConfirmation,
      detail: asksConfirmation
        ? "irreversible phrase retained with an explicit confirmation question."
        : "response must keep the irreversible phrase, ask a question, and request confirmation.",
    };
  },
  "code-syntax": (text, config, _context) => {
    const language = String(config.language ?? "typescript");
    const functionName = config.functionName === undefined ? null : String(config.functionName);
    const fenced = [...text.matchAll(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g)].map((match) =>
      match[1] ?? "",
    );
    let candidates = fenced;
    if (candidates.length === 0 && functionName !== null) {
      candidates = [extractBalancedFunction(text, functionName)];
    }
    if (candidates.length === 0) {
      return {
        id: "code-syntax",
        passed: false,
        detail: "no fenced code block found in the response.",
      };
    }
    if (functionName !== null && !candidates.some((code) => code.includes(functionName))) {
      return {
        id: "code-syntax",
        passed: false,
        detail: `requested function '${functionName}' is absent from the code block.`,
      };
    }
    const diagnostics = [];
    for (const code of candidates) {
      diagnostics.push(...syntaxDiagnostics(code, language));
    }
    return {
      id: "code-syntax",
      passed: diagnostics.length === 0,
      detail:
        diagnostics.length === 0
          ? `code block parses as ${language}.`
          : `code block has syntax errors: ${diagnostics
              .filter((_diagnostic, index) => index < 3)
              .join(" | ")}`,
    };
  },
  "paragraph-count": (text, config, _context) => {
    const count = Number(config.count);
    if (!Number.isInteger(count) || count < 1) {
      throw new Error("paragraph-count requires a positive integer 'count' option.");
    }
    const paragraphs = text
      .split(/\n[ \t]*\n+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .filter((part) => config.includeHeadings === true || !part.split("\n").every((line) => /^#{1,6}\s/.test(line.trim())));
    const matches = paragraphs.length === count;
    return {
      id: "paragraph-count",
      passed: matches,
      detail: matches
        ? `found exactly ${count} paragraphs.`
        : `expected ${count} paragraphs, found ${paragraphs.length}.`,
    };
  },
  "persisted-prose": (text, config, _context) => {
    const minWords = Number(config.minWords ?? 12);
    const minSentenceRatio = Number(config.minSentenceRatio ?? 0.75);
    const minSentenceWords = Number(config.minSentenceWords ?? 5);
    const sentences = text
      .split(/(?<=[.!?。！？])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);
    const totalWords = countWords(text);
    if (sentences.length === 0 || totalWords < minWords) {
      return {
        id: "persisted-prose",
        passed: false,
        detail: `persisted text is too short: ${totalWords} words across ${sentences.length} sentences.`,
      };
    }
    const fullSentences = sentences.filter(
      (sentence) => countWords(sentence) >= minSentenceWords,
    ).length;
    const ratio = fullSentences / sentences.length;
    return {
      id: "persisted-prose",
      passed: ratio >= minSentenceRatio,
      detail:
        ratio >= minSentenceRatio
          ? `${fullSentences}/${sentences.length} sentences are full prose.`
          : `only ${fullSentences}/${sentences.length} sentences reach ${minSentenceWords} words; persisted content must stay full prose.`,
    };
  },
  "tool-structure": (_text, config, context) => {
    const toolName = String(config.toolName ?? "");
    const requiredInput = Array.isArray(config.requiredInput) ? config.requiredInput.map(String) : [];
    const allowAdditionalInput = config.allowAdditionalInput !== false;
    if (toolName.length === 0) {
      throw new Error("tool-structure requires a non-empty 'toolName' option.");
    }
    if (context.expectsTool && context.toolCall === null) {
      return {
        id: "tool-structure",
        passed: false,
        detail: `expected a ${toolName} tool call but the response contained none.`,
      };
    }
    if (context.toolCall === null) {
      return {
        id: "tool-structure",
        passed: false,
        detail: "no tool call captured for a tool-structure check.",
      };
    }
    if (context.toolCall.name !== toolName) {
      return {
        id: "tool-structure",
        passed: false,
        detail: `expected tool '${toolName}' but the call used '${context.toolCall.name}'.`,
      };
    }
    const input = context.toolCall.input ?? {};
    const missing = requiredInput.filter(
      (field) => typeof input[field] !== "string" && typeof input[field] !== "number" && typeof input[field] !== "boolean",
    );
    if (missing.length > 0) {
      return {
        id: "tool-structure",
        passed: false,
        detail: `tool '${toolName}' input is missing required fields: ${missing.join(", ")}.`,
      };
    }
    if (!allowAdditionalInput) {
      const allowed = new Set(requiredInput);
      const extra = Object.keys(input).filter((field) => !allowed.has(field));
      if (extra.length > 0) {
        return {
          id: "tool-structure",
          passed: false,
          detail: `tool '${toolName}' input has unexpected fields: ${extra.join(", ")}.`,
        };
      }
    }
    return {
      id: "tool-structure",
      passed: true,
      detail: `tool '${toolName}' called with the required input shape.`,
    };
  },
};

function extractBalancedFunction(text, functionName) {
  const start = text.indexOf(`function ${functionName}`);
  if (start === -1) return "";
  const openBrace = text.indexOf("{", start);
  if (openBrace === -1) return "";
  let depth = 0;
  for (let index = openBrace; index < text.length; index++) {
    const char = text[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.substring(start, index + 1);
    }
  }
  return "";
}

function syntaxDiagnostics(code, language) {
  if (language !== "typescript" && language !== "javascript") {
    return [`unsupported code language '${language}'`];
  }
  let ts;
  try {
    ts = require("typescript");
  } catch {
    return ["typescript compiler unavailable; code syntax cannot be verified"];
  }
  const result = ts.transpileModule(code, {
    reportDiagnostics: true,
    fileName: "evaluation-snippet.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const errors = (result.diagnostics ?? []).map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
  );
  return errors;
}

function countWords(text) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  return [...segmenter.segment(text)].filter((segment) => segment.isWordLike).length;
}

/**
 * Run structured hard requirements. Requirements own both validation and
 * protected-content metadata, preventing schema fields from drifting apart.
 *
 * @param {string} text
 * @param {Array<Record<string, unknown>>} requirements
 * @returns {Record<string, unknown>}
 */
function protectedValuesForRequirement(requirement) {
  const values = [
    requirement.value,
    requirement.marker,
    ...(Array.isArray(requirement.requiredTerms) ? requirement.requiredTerms : []),
    requirement.phrase,
    requirement.sentence,
    requirement.functionName,
    requirement.count,
    requirement.toolName,
    ...(Array.isArray(requirement.orderedTerms) ? requirement.orderedTerms : []),
  ];
  return values
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value));
}

export function runRequirements(text, requirements = [], context = {}) {
  const validatorConfigs = [];
  const requiredTerms = [];
  for (const requirement of requirements) {
    const common = { ...requirement };
    switch (requirement.kind) {
      case "exact-term":
        requiredTerms.push(String(requirement.value ?? ""));
        validatorConfigs.push({ ...common, id: "terms", requiredTerms: [String(requirement.value ?? "")] });
        break;
      case "exact-value":
        validatorConfigs.push({ ...common, id: "exact-value", value: requirement.value });
        break;
      case "safety-warning":
        validatorConfigs.push({ ...common, id: "warning-prose", marker: requirement.marker ?? "SECURITY WARNING" });
        break;
      case "confirmation":
        validatorConfigs.push({ ...common, id: "confirmation-language", phrase: requirement.phrase });
        break;
      case "numbered":
        validatorConfigs.push({ ...common, id: "numbered-order", count: requirement.count });
        break;
      case "exact-negation":
        validatorConfigs.push({ ...common, id: "exact-negation", sentence: requirement.sentence, core: requirement.core });
        break;
      case "code":
        validatorConfigs.push({ ...common, id: "code-syntax", language: requirement.language, functionName: requirement.functionName });
        break;
      case "persisted-prose":
        validatorConfigs.push({ ...common, id: "persisted-prose", minWords: requirement.minWords });
        break;
      case "paragraph-count":
        validatorConfigs.push({
          ...common,
          id: "paragraph-count",
          count: requirement.count,
          includeHeadings: requirement.includeHeadings ?? true,
        });
        break;
      case "tool":
        validatorConfigs.push({ ...common, id: "tool-structure", toolName: requirement.toolName, requiredInput: requirement.requiredInput, allowAdditionalInput: requirement.allowAdditionalInput });
        break;
      case "groundedness":
        validatorConfigs.push({ ...common, id: "groundedness", expected: requirement.expected, underSpecified: requirement.underSpecified });
        break;
      default:
        validatorConfigs.push({ ...common, id: "unknown-requirement" });
        break;
    }
  }
  const validation = runValidators(text, validatorConfigs, {
    ...context,
    toolCall: context.toolCall ?? context.toolCalls?.[0] ?? null,
    requiredTerms,
  });
  const checks = validation.checks.map((check, index) => ({
    ...check,
    id: String(requirements[index]?.id ?? requirements[index]?.kind ?? check.id),
    hardGroup: String(requirements[index]?.hardGroup ?? "correctness"),
    ...(requirements[index]?.kind === "exact-term" && check.passed
      ? { detail: "all required terms present" }
      : {}),
  }));
  const groupPassed = (group) => checks.filter((check) => check.hardGroup === group).every((check) => check.passed);
  return {
    passed: checks.every((check) => check.passed),
    groups: {
      correctnessPass: groupPassed("correctness"),
      groundednessPass: groupPassed("groundedness"),
      contractPass: groupPassed("contract"),
      safetyPass: groupPassed("safety"),
    },
    protectedContent: [...new Set(
      requirements
        .filter((requirement) => requirement?.protected === true)
        .flatMap(protectedValuesForRequirement),
    )],
    checks,
  };
}

/**
 * @param {string} text
 * @param {ValidatorConfig[]} validatorConfigs
 * @param {ValidatorContext} context
 * @returns {ValidationOutcome}
 */
export function runValidators(text, validatorConfigs, context) {
  const checks = validatorConfigs.map((config) => {
    const impl = VALIDATORS[config.id];
    if (impl === undefined) {
      return { id: config.id, passed: false, detail: `unknown validator '${config.id}'` };
    }
    try {
      return impl(text, config, context);
    } catch (error) {
      return {
        id: config.id,
        passed: false,
        detail: `validator '${config.id}' errored: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
  return { passed: checks.every((item) => item.passed), checks };
}
