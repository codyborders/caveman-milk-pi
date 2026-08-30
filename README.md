# caveman-milk-pi

caveman-milk-pi is an opt-in [Pi](https://github.com/badlogic/pi-mono) extension. It adds compact response-style rules to Pi's system prompt.

## Behavior

Active modes add deterministic prompt text. Mode `off` adds nothing and remains the default.

The extension computes prompt text during `session_start`. The `before_agent_start` handler only appends cached text.

The rules shorten chat responses. They do not compress context, tool results, files, code, comments, commits, PR text, or model reasoning.

Persisted content and tool arguments use normal prose. Security warnings, irreversible confirmations, ordered safety steps, and clarification requests use clear prose.

Caveman can lose on already-terse tasks. Each active turn has fixed prompt overhead. Compare matched provider totals before selecting a mode.

Output-token reduction alone does not establish lower total cost.

## Prompt footprint

The compact generator replaces the former filtered-markdown injector. Measurements use JavaScript character counts and a four-characters-per-token estimate.

| Mode | Former characters | Current characters | Former estimated tokens | Current estimated tokens |
| --- | ---: | ---: | ---: | ---: |
| `lite` | 4,276 | 603 | 1,069 | 151 |
| `full` | 4,216 | 610 | 1,054 | 153 |
| `ultra` | 4,213 | 647 | 1,054 | 162 |
| `wenyan-lite` | 4,103 | 672 | 1,026 | 168 |
| `wenyan` | 4,262 | 696 | 1,066 | 174 |
| `wenyan-ultra` | 4,158 | 706 | 1,040 | 177 |

All active prompts remain below the 800-character limit. Exact token counts remain unreported until a provider count endpoint returns them.

## Install

```bash
pi install git:github.com/codyborders/caveman-milk-pi
```

Activate a mode inside Pi:

```text
/caveman lite
/caveman full
/caveman ultra
```

Disable the extension with `/caveman off`.

## Modes

```text
/caveman               show current mode and usage
/caveman off           disable prompt injection
/caveman lite          use concise complete sentences
/caveman full          use concise sentences or clear fragments
/caveman ultra         use the fewest clear words
/caveman wenyan-lite   use light literary Chinese for Chinese input
/caveman wenyan        use literary Chinese for Chinese input
/caveman wenyan-ultra  use compressed literary Chinese for Chinese input
```

Wenyan modes affect Chinese input only. English prompts remain English.

Technical terms, commands, identifiers, quoted errors, and persisted content keep their appropriate original language.

## Status and diagnostics

The footer shows `caveman: <mode>` by default.

```text
/caveman status off    hide the footer entry without changing mode
/caveman status on     show the footer entry
/caveman diff          show cached mode, hash, size, token estimate, and prompt text
```

## Configuration

The configuration file is named `caveman-milk-pi.json`. It lives in the platform config root.

| Platform | Default path |
| --- | --- |
| Linux | `$XDG_CONFIG_HOME/caveman-milk-pi.json` (default `~/.config/caveman-milk-pi.json`) |
| macOS | `~/Library/Application Support/caveman-milk-pi.json` |
| Windows | `%APPDATA%\caveman-milk-pi.json` (Roaming) |

Set `CAVEMAN_MILK_CONFIG_DIR` to override the config directory on any platform. A relative `XDG_CONFIG_HOME` value is ignored per the XDG specification.

```json
{
  "schemaVersion": 1,
  "mode": "off",
  "showStatus": true
}
```

### Migration

First load migrates older state when the target file is absent. Candidates are checked in this order:

1. `pi-caveman.json` in the same directory as the target.
2. The prior default `~/.config/caveman-milk-pi.json`.
3. The former `~/.config/pi-caveman.json`.

Older flat files without `schemaVersion` are rewritten in place in the current format. Migrated files are normalized to `0600` permissions.

The legacy `enabled` field is accepted during migration and then removed. No released version ever consulted it. Injection was keyed on `mode` alone from v0.1.0 onward. Migration preserves `mode` verbatim, matching what the extension actually did with those files. A v0.1.x user with `enabled: false` kept the injected mode then. The same user keeps it now. Run `/caveman off` to disable injection.

### Validation

Unknown schema versions, unknown fields, and invalid field types stop loading. Every validation error names the exact path being loaded.

### Concurrent-safe updates

Mode and status changes run through a locked update. The update acquires a short-lived `<config>.lock` in the same directory. It reloads the latest valid config. It applies exactly one field-level change. It saves atomically. It then releases the lock. Concurrent Pi sessions changing different fields cannot lose each other's updates.

The lock carries an ownership token. A process only deletes a lock it still owns. A crashed writer's lock is recovered conservatively after ten seconds of inactivity. Waiting is bounded at fifteen seconds. A crash never blocks configuration permanently. A live owner's lock is never deleted.

A mutator may change zero fields or exactly one field. A zero-field change is a no-op that reloads but does not rewrite the file. Changing both fields in one update is rejected.

Writes use a random temporary filename in the configuration directory. The extension renames that file atomically with `0600` permissions. It removes the temporary file after failures.

## Cache behavior

Prompt bytes depend only on the selected mode and committed runtime constants.

They contain no timestamps, counters, session identifiers, request text, or filesystem data.

Repeated calls within one mode return identical text. A mode change intentionally changes the system prompt.

## Evaluation

The repository includes 15 deterministic fixtures across seven modes. The matrix contains 105 matched cases.

Fixtures cover technical explanations, comparisons, critical negation, ordered migrations, warnings, and irreversible-action confirmations. They also cover persisted content, tutorials, clarification requests, and Wenyan language behavior.

Offline validation checks fixture structure, matrix size, prompt parity, and prompt length.

```bash
npm run evaluate:offline
```

Provider execution is disabled by default. It requires a key, a model name, and explicit paid-run authorization. Supported providers are `offline`, `anthropic`, and `pi`. Other names exit before any request.

Optional token accounting uses the provider count endpoint. Reports label counts as `not-run` unless that endpoint returns exact model values.

```bash
CAVEMAN_EVAL_PROVIDER=anthropic \
CAVEMAN_EVAL_ALLOW_PAID=1 \
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
CAVEMAN_EVAL_MODEL="$CAVEMAN_EVAL_MODEL" \
CAVEMAN_EVAL_MAX_PAID_CALLS=400 \
CAVEMAN_EVAL_REPETITIONS=3 \
CAVEMAN_EVAL_SEED=0xa1b2c3d4 \
CAVEMAN_EVAL_CHECKPOINT="evaluation-checkpoint.json" \
CAVEMAN_EVAL_OUTPUT="evaluation-report.json" \
npm run evaluate
```

`CAVEMAN_EVAL_MODES` and `CAVEMAN_EVAL_CATEGORIES` accept comma-separated filters. A selection with an active mode must also include `off`. The runner rejects other selections before any paid request. Comparative scoring also requires at least three repetitions per pair.

Paid CLI runs require `CAVEMAN_EVAL_MAX_PAID_CALLS`. The cap counts each direct-provider, token-count, and judge HTTP attempt. For Pi runs, it counts each Pi process launch. Retries inside Pi are not observable. The run stops before the next counted attempt would exceed the cap. Reports list logical cases separately from counted attempts. Timeout and retry controls use `CAVEMAN_EVAL_TIMEOUT_MS` and `CAVEMAN_EVAL_MAX_ATTEMPTS`.

`CAVEMAN_EVAL_BASE_SYSTEM_PROMPT_FILE` can replace the committed Pi prompt capture. `CAVEMAN_EVAL_PI_BIN` selects another Pi executable. `CAVEMAN_EVAL_COMMIT` records an explicit candidate commit.

The runner appends caveman runtime text after a captured Pi base system prompt. The capture lives in `scripts/eval/pi-base-system-prompt.json` and comes from Pi 0.84.3.

The `pi` provider runs each case through the real Pi CLI in JSON mode. It loads the extension and gives every call a fresh temporary `CAVEMAN_MILK_CONFIG_DIR` holding the mode config. Each call is single-turn, so no session context accumulates, and the temporary directory is removed afterwards. Supplied seeds must be valid hexadecimal. Malformed seeds are rejected instead of silently randomized.

Arm order is randomized per repetition and category from a stored seed. The seed appears in the report, so any run can be reproduced.

Brevity gates use provider-reported output tokens as the primary metric. An output ratio requires positive integer output usage in both arms. A pair with missing or invalid output usage is reported as incomplete, fails brevity fail-closed, and stays out of paired deltas. Word counts remain in the report as a readability diagnostic only. Raw provider usage objects are preserved verbatim on every result.

Deterministic validators check exact negation, numbered step order, warning prose, confirmation language, TypeScript code syntax, requested paragraph count, tool-call structure, term retention, and persisted prose. A validator failure fails the case and the overall report.

Set `CAVEMAN_EVAL_JUDGE=1` to enable the blinded quality judge. The judge uses the committed prompt and rubric under `scripts/eval/`. It never learns which arm is which. A judge score below the baseline fails the overall report even when output is shorter.

Each completed paid call is written to an incremental atomic checkpoint. Checkpointed runs require `CAVEMAN_EVAL_SEED` so a retry rebuilds the same call order.

After a request failure, rerun the same command to resume completed calls. A provider success followed by local checkpoint failure can still require manual review.

Reports contain paired raw results and aggregate statistics. Aggregates cover input tokens, cache writes, cache reads, output tokens, latency, quality scores, and provider cost. Cost appears only when `CAVEMAN_EVAL_PRICING` supplies a JSON pricing table. Example: `{"inputPerMTok":5,"outputPerMTok":25,"cacheWritePerMTok":6.25,"cacheReadPerMTok":0.5}`.

Every report records the Git commit, Pi version, Node version, platform, provider, model, fixture version, seed, run id, and execution order.

The evaluation never publishes a savings percentage. Publish claims only from committed raw reports.

## Development

```bash
npm ci
npm test
npm run typecheck
npm run evaluate:offline
npm pack --dry-run
npm run test:package
```

The development dependency targets Pi `0.84.3`. That Pi release requires Node `22.19.0` or newer.

CI also runs unit checks on Node 20. Real Pi loader checks run only on supported Node versions.

## Fork identity and credits

This fork lives at [codyborders/caveman-milk-pi](https://github.com/codyborders/caveman-milk-pi).
Install from GitHub so npm scope ownership is not assumed.

Rules were reviewed against caveman commit `17f9f2ec2377b0bfe16b52ee03a462e7f0a02bc8`, dated 2026-08-25.

Runtime injection uses purpose-built compact constants. `skill/SKILL.md` preserves the reviewed upstream artifact byte for byte.

See [CREDITS.md](./CREDITS.md) for source details and licensing.

## Shared-prefix v12 holdout

The `eval/shared-prefix-v12` branch adds a separate harness under `scripts/eval/`. It never touches runtime injection.

The fixture `scripts/eval/shared-prefix-v12-fixtures.json` holds two groups. `eligible-prose` covers technical explanations, implementation recaps, comparisons, progress summaries, completion summaries, noncritical troubleshooting, and removable repetition. `protected-content` covers warnings, confirmations, commands, paths, ordered procedures, persisted artifacts, and agent handoffs. Every task declares required facts.

A paid run captures one Caveman-off base execution per task. The base runs a parent and real children. Their canonical source bytes are locked under a sha256. Both finalizer arms then replay those bytes. Only the appended finalizer prompt differs. Protected tasks skip all finalizer work with zero prompt tokens. Gates demand complete-product token and latency upper intervals below zero. Any failure keeps mode `off`.

Final v1 completed with 35 valid warm pairs and no cache exclusions. Every release gate did not pass. Mode `off` remains the default.

The isolated finalizer comparison reduces tokens and latency. The complete product adds 108,341.8 mean tokens and 6,456.8 ms mean latency. One critical information loss and two unsupported claims keep release blocked. Protected routing adds no prompt tokens or finalizer calls, but normal-off outputs omit required protected content.

Structural and analysis checks:

```bash
npm run evaluate:v12:offline
npm run evaluate:v12:analysis
```

## License

MIT.
