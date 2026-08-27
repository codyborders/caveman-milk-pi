import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function registerEvaluationTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "write_artifact",
    label: "Write evaluation artifact",
    description: "Return persisted text for evaluation without writing a user file.",
    parameters: Type.Object({
      content: Type.String({ description: "Complete persisted text." }),
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: params.content }],
        details: { content: params.content },
      };
    },
  });
}
