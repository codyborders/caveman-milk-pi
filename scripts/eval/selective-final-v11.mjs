const USAGE_FIELDS = ["input", "cacheRead", "cacheWrite", "output"];
function validUsage(usage) { return usage && USAGE_FIELDS.every((field) => Number.isFinite(usage[field])); }
export function sumCompleteTreeUsage(result) {
  if (!validUsage(result?.usage)) return null;
  const nodes = [result];
  if (result.nested !== undefined && result.nested !== null) {
    if (result.nested.complete !== true || !Array.isArray(result.nested.children) || result.nested.children.length === 0) return null;
    nodes.push(...result.nested.children);
  }
  if (result.finalizer !== undefined && result.finalizer !== null) {
    if (!validUsage(result.finalizer.usage)) return null;
    nodes.push(result.finalizer);
  }
  if (nodes.some((node) => !validUsage(node?.usage))) return null;
  const totals = Object.fromEntries(USAGE_FIELDS.map((field) => [field, nodes.reduce((sum, node) => sum + node.usage[field], 0)]));
  return { ...totals, total: USAGE_FIELDS.reduce((sum, field) => sum + totals[field], 0) };
}
export function completeTreeLatency(result) {
  const baseMs = Number.isFinite(result?.elapsedMs) ? result.elapsedMs : null;
  const finalizerMs = Number.isFinite(result?.finalizer?.elapsedMs) ? result.finalizer.elapsedMs : null;
  return { baseMs, finalizerMs, completeMs: baseMs === null || finalizerMs === null ? null : baseMs + finalizerMs };
}

function firstChildCacheRead(child) {
  for (const rawEvent of child?.rawEvents ?? []) {
    try {
      const event = typeof rawEvent === "string" ? JSON.parse(rawEvent) : rawEvent;
      if (event?.type === "message_end" && event?.message?.role === "assistant") {
        return event.message.usage?.cacheRead ?? null;
      }
    } catch {
      return null;
    }
  }
  return child?.usage?.cacheRead ?? null;
}

export function firstTurnCacheReads(result) {
  return [
    result?.usageTurns?.[0]?.cacheRead ?? result?.usage?.cacheRead,
    ...(result?.nested?.children ?? []).map(firstChildCacheRead),
    result?.finalizer?.usageTurns?.[0]?.cacheRead ?? result?.finalizer?.usage?.cacheRead,
  ];
}

export function cacheEligibility(result, rule) {
  const values = firstTurnCacheReads(result);
  const wanted = rule === "zero" ? 0 : rule === "positive" ? 1 : null;
  return wanted !== null && values.length > 0 && values.every((value) => Number.isFinite(value) && (wanted === 0 ? value === 0 : value > 0));
}

export function assessSelectiveFinalTopology(record) {
  const expected = record?.arm === "off" ? 0 : 1;
  const children = Array.isArray(record?.children) ? record.children : [];
  const checks = {
    baseOff: record?.base?.mode === "off",
    childrenOff: children.every((child) => child?.mode === "off"),
    handoffBeforeInjection: record?.base?.handoffComplete === true,
    candidateNodes: record?.finalizer?.injectedCandidateNodes === expected,
    finalizerToolsEmpty: Array.isArray(record?.finalizer?.tools) && record.finalizer.tools.length === 0,
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

export function evaluateSelectiveFinalGates({
  tokenUpper95,
  latencyUpper95,
  nestedSuccessLower95,
  nestedCandidateSuccessRate = 1,
  preservationLosses,
}) {
  const gates = {
    totalTokens: Number.isFinite(tokenUpper95) && tokenUpper95 < 0,
    latency: Number.isFinite(latencyUpper95) && latencyUpper95 < 0,
    nestedSuccess:
      Number.isFinite(nestedSuccessLower95) &&
      nestedSuccessLower95 >= 0 &&
      nestedCandidateSuccessRate === 1,
    preservation: preservationLosses === 0,
  };
  return { passed: Object.values(gates).every(Boolean), gates, defaultMode: Object.values(gates).every(Boolean) ? "selective-final-v11" : "off" };
}
