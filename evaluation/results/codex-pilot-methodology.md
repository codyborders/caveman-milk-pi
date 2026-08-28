# Codex Pilot Invalidated

The report previously published here as `codex-pilot.json` is invalidated.

It was produced at commit `fbc34b2`. Three evaluation defects were found after the run. Captured tool calls never reached the deterministic validators, which produced nine false tool-validator failures, and commit `4901ea0` fixed that wiring. Usage and cost from tool-loop turns were dropped because only the final assistant turn was recorded per case. The blinded judge saw raw response text only, so tool-answer arms were judged without their tool calls.

The raw report is preserved byte-for-byte as `codex-pilot-invalidated-fbc34b2.json`. Its pass totals are not valid results. Do not cite them. Cost and token totals built on dropped tool-loop usage are also invalid.

A corrected pilot needs paid approval before rerun.

Only the corrected report may publish totals again. Generate its summary with this command:

```bash
node scripts/render-evaluation-summary.mjs evaluation/results/codex-pilot.json evaluation/results/codex-pilot-methodology.md
```
