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
| `lite` | 4,276 | 641 | 1,069 | 161 |
| `full` | 4,216 | 648 | 1,054 | 162 |
| `ultra` | 4,213 | 685 | 1,054 | 172 |
| `wenyan-lite` | 4,103 | 703 | 1,026 | 176 |
| `wenyan` | 4,262 | 720 | 1,066 | 180 |
| `wenyan-ultra` | 4,158 | 733 | 1,040 | 184 |

All active prompts remain below the 800-character limit. Exact token counts vary by provider tokenizer.

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

Configuration is stored at `~/.config/caveman-milk-pi.json`.

```json
{
  "schemaVersion": 1,
  "mode": "off",
  "showStatus": true
}
```

The loader migrates older flat configuration. It also migrates the former `~/.config/pi-caveman.json` filename.

Unknown schema versions and invalid field types stop loading with a specific error.

Writes use a random temporary filename in the configuration directory. The extension renames that file atomically and removes it after failures.

## Cache behavior

Prompt bytes depend only on the selected mode and committed runtime constants.

They contain no timestamps, counters, session identifiers, request text, or filesystem data.

Repeated calls within one mode return identical text. A mode change intentionally changes the system prompt.

## Evaluation

The repository includes 15 deterministic fixtures across seven modes. The matrix contains 105 matched cases.

Fixtures cover technical explanations, comparisons, critical negation, ordered migrations, warnings, and confirmations. They also cover persisted content, tutorials, clarification, and Wenyan language behavior.

Offline validation checks fixture structure, matrix size, prompt parity, and prompt length.

```bash
npm run evaluate:offline
```

Provider execution is disabled by default. It requires a key, a model name, and explicit paid-run authorization.

```bash
CAVEMAN_EVAL_PROVIDER=anthropic \
CAVEMAN_EVAL_ALLOW_PAID=1 \
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
CAVEMAN_EVAL_MODEL="$CAVEMAN_EVAL_MODEL" \
CAVEMAN_EVAL_OUTPUT="evaluation-report.json" \
npm run evaluate
```

`CAVEMAN_EVAL_MODES` and `CAVEMAN_EVAL_CATEGORIES` accept comma-separated filters. Filters support smaller controlled runs before the full matrix.

Provider reports include responses, timing, tool-call counts, word ratios, term retention, threshold status, and provider usage fields.

The provider runner does not infer monetary cost. It does not publish an aggregate savings percentage.

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

## License

MIT.
