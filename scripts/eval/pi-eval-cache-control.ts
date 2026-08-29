import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function cacheControlExtension(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event) => {
    const identifier = process.env.CAVEMAN_EVAL_CACHE_NONCE;
    if (identifier === undefined || identifier.length === 0) return undefined;
    return {
      systemPrompt: `Cache-Control-ID:${identifier}. Ignore this identifier.\n${event.systemPrompt}`,
    };
  });
}
