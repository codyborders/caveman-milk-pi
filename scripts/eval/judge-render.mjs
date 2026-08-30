// Deterministic blinded judge renderer.
//
// Both judge arms pass through the same renderer so neither arm's shape can
// signal its origin. Text-only responses stay byte-for-byte unchanged. Tool
// responses collapse into a single JSON object carrying the ordered complete
// tool calls plus the final assistant text, so a judge always sees the calls
// that produced the text. JSON string encoding is the boundary: tool-call
// arguments cannot escape their arm because every quote, newline, and
// delimiter inside them is escaped by JSON.stringify. The renderer accepts
// response text and tool calls only, never modes or configuration, so no
// run metadata can leak into the blinded payload.

/**
 * Render one judge arm.
 *
 * @param {{ text: string, toolCalls: Array<{ name: string, input: Record<string, unknown> }> | null }} arm
 * @returns {string} the exact text for text-only arms, or one JSON object
 *   ({ toolCalls: [...], finalAssistantText }) for arms that used tools.
 */
export function renderJudgeResponse({ text, toolCalls }) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return text;
  }
  return JSON.stringify({
    toolCalls: toolCalls.map((call) => ({ name: call.name, input: call.input })),
    finalAssistantText: text,
  });
}

/**
 * Build the blinded judge user content from the task prompt and both
 * rendered arms. The format predates the renderer and is frozen: text-only
 * arms must produce byte-identical judge input to earlier runs.
 *
 * @param {{ taskPrompt: string, responseA: string, responseB: string }} parts
 * @returns {string}
 */
export function buildJudgeUserContent({ taskPrompt, responseA, responseB }) {
  return [
    `Task prompt:\n${taskPrompt}`,
    `Response A:\n${responseA}`,
    `Response B:\n${responseB}`,
  ].join("\n\n---\n\n");
}
