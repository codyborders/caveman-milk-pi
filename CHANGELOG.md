# Changelog

This file records caveman-milk-pi releases. Version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.4.0-beta.1 - Unreleased

### Added

Configuration updates now run through a locked `updateConfig` operation. A short-lived same-directory lock serializes concurrent Pi sessions. Simultaneous `mode` and `showStatus` changes both survive. Stale locks from crashed writers recover conservatively after ten seconds. Waiting is bounded at fifteen seconds.

Multi-process tests now cover concurrent field updates, first-run creation, legacy migration, and crashed-writer recovery.

A config-root override is now supported through `CAVEMAN_MILK_CONFIG_DIR`. Configuration honors `XDG_CONFIG_HOME` on Linux, `~/Library/Application Support` on macOS, and `%APPDATA%` on Windows.

Configuration now has schema validation and migration for older flat files. Atomic writes use random temporary names and clean failed writes.

Tests now cover commands, Pi lifecycle hooks, configuration, prompt generation, and evaluation. Offline evaluation contains 105 matched cases. Anthropic execution requires explicit paid-run authorization.

The evaluation validates the provider name against an allowlist. It rejects selections without the `off` baseline before any paid request. Comparative scoring requires at least three repetitions per pair.

Provider runs append caveman runtime text after a captured Pi 0.84.3 base system prompt. The new `pi` provider runs each case through the real Pi CLI in JSON mode with the extension loaded.

Brevity gates now use provider-reported output tokens. Word counts remain a readability diagnostic.

Deterministic validators now cover exact negation, numbered step order, warning prose, confirmation language, TypeScript code syntax, and persisted prose. They also cover requested paragraph count, tool-call structure, and term retention.

A blinded quality judge with committed prompt and rubric can fail the overall report when the active arm loses quality.

The blinded judge can also run through the `pi` provider. Each judge call spawns a fresh Pi process using `CAVEMAN_EVAL_JUDGE_MODEL` or the case model. The committed judge prompt and rubric become the Pi system prompt, and only the blinded task plus responses travel as user content. Judge processes run with mode `off` in an isolated temporary config directory and require no Anthropic key. Each judge process reserves one shared-cap attempt reported under judge. A Pi process is counted once while its internal retries remain unobservable.

Paid calls get a per-attempt timeout plus bounded retry for rate limits and transient failures. CLI execution also requires an explicit maximum call count.

An incremental atomic checkpoint resumes recorded calls. Its identity binds the model, commit, prompt, provider, matrix, repetition count, and seed.

Reports pair raw results with aggregate statistics. Aggregates cover token counts, cache traffic, latency, quality scores, and provider cost when pricing is set. Environment metadata records the Git commit and the Pi version. It also records the stored seed and the run order.

An offline rescore command verifies locked paid inputs before reapplying deterministic validators. It writes separate JSON and Markdown artifacts without starting Pi or a provider.

Schema 4 summaries now include whole-run usage, eligible-pair compression, and pairwise behavioral attribution by category and hard group.

### Changed

Every configuration validation error now names the exact path being loaded.

Mode and status changes now apply exactly one field-level change per locked update. A zero-field mutator reloads without rewriting the file. Migrated files are normalized to `0600` permissions.

Runtime prompts now use compact contract v9 instead of filtered markdown. Active prompts contain 437 to 507 characters. Mode `off` injects zero bytes. Contract v9 remains unexecuted.

Development now targets Pi `0.84.3`. Vendored rules match caveman commit `17f9f2ec2377b0bfe16b52ee03a462e7f0a02bc8`.

Documentation now separates prompt-size measurements from provider cost claims.

Confirmation now requires one approval question that names only the configured target. Generic cancellation, wrong-target, discovery-only, and later-promise responses fail. Mode `off` remains the default.

Targeted-v2 through targeted-v6 failed the all-active-pass gate. V8 passed every full confirmation and clarification case but missed one exact phrase plus one grounded artifact after offline correction. Contract v9 passes the corrected targeted-v8 behavioral gate. Both active modes passed all 40 cases after offline validator correction. Blinded quality had no active losses. Fresh-v1 is now the next gate.

### Fixed

Schema 4 summaries preserve the strict report status instead of rendering every report as failed. Usage tables now separate whole-run totals from eligible-pair compression.

Exact-term validation now ignores natural-language capitalization unless fixtures require exact casing. Markdown emphasis does not alter the underlying phrase check.

Persisted-content validation now recognizes commit subjects, PR headings, PR lists, and document paragraphs. It validates requested artifacts without letting surrounding commentary determine the result.

Targeted confirmation binds approval to the exact configured target inside one qualifying question. Targeted commit and PR groundedness rejects unsupported tests, coverage, benchmarks, backups, manual verification, extra files, modules, and migration behavior. Explicit statements about missing information remain valid.

Git commit discovery now imports `execFileSync` at module scope, so the default discovery works in plain ESM node processes without `CAVEMAN_EVAL_COMMIT`.

The default Pi executable now targets the `@earendil-works/pi-coding-agent` CLI JavaScript entry instead of a `.bin` shim. The default spawn runs JavaScript entry points through the current node executable, so `CAVEMAN_EVAL_PI_BIN` accepts `.js`, `.mjs`, and `.cjs` values on every platform. Checkpoint permission assertions now run only where POSIX mode bits are supported.

Token accounting validity is now strict. Missing usage stays `null`. Output ratios require positive integer output usage in both arms. A pair with missing or invalid output usage is reported as incomplete, fails brevity fail-closed, and stays out of paired deltas. Reports carry complete and incomplete pair counts and preserve raw provider usage verbatim.

The evaluation fixture no longer duplicates prompt rules. Runtime prompts load from the production `src/prompt-contract.json`. Direct requests carry the production text for every mode. Reports carry the runtime prompt hash, and a contract change invalidates checkpoint reuse.

Every Pi call now uses a fresh temporary `CAVEMAN_MILK_CONFIG_DIR` and is single-turn, so user config stays isolated and no session context accumulates.

Malformed supplied seeds are now rejected instead of silently randomized.

The paid cap now counts every direct-provider, token-count, and judge HTTP attempt. The run stops before the next attempt would exceed it. Budget stops are reported immediately instead of being retried or wrapped as request failures. Reports list logical cases separately from counted attempts.

Token-count attempts now consume the same paid budget, and every configuration check finishes before the first count request. Planned and actual totals cover provider, judge, and count-endpoint attempts.

Every Pi process now reserves and reports one provider attempt immediately before it starts. A Pi run stops before any process that would exceed the cap. Retries inside a Pi process are not observable and are never claimed.

The paid cap now applies cumulatively across invocations. Every counted attempt is reserved and atomically persisted to the checkpoint before it is issued. Reservations split into provider, judge, and count-endpoint totals. A resumed run loads prior totals and stops before the cumulative total would exceed `CAVEMAN_EVAL_MAX_PAID_CALLS`. The checkpoint now opens before token-count traffic, so count attempts persist too. Completed count results are checkpointed and reused on resume instead of reissued. Reports carry cumulative actual totals plus an `invocation` block for the current process. An empty checkpoint written before this change starts with zero reservations. A non-empty older checkpoint cannot reveal prior retry attempts, so resume is rejected while the file remains intact. Corrupt reservation data also fails closed instead of resetting the budget. Memory checkpoints keep accounting local to the invocation.

Raw provider usage is now preserved verbatim for Pi results and for every judge result. Cost computation returns `null` when any pricing-relevant usage field is missing instead of substituting zero. Reports add a top-level `primaryUsageComplete` gate. It requires positive integer output usage on every result, off arms included, and the overall pass now requires it. The run identity now hashes the entire prompt contract as `promptContractHash`, so any contract-file change invalidates checkpoint reuse.

## 0.2.0 - 2026-04-16

The npm package changed from `@tomooshi/pi-caveman` to `@tomooshi/caveman-milk-pi`.

The config path changed from `~/.config/pi-caveman.json` to `~/.config/caveman-milk-pi.json`. First load moves the old file when needed.

## 0.1.5 - 2026-04-16

User-facing project names changed to `caveman-milk-pi`. Package and config names remained unchanged until `0.2.0`.

## 0.1.4 - 2026-04-16

A live Opus 4.7 check covered `wenyan-full`. It confirmed mode filtering, CJK round trips, classical register, and preserved English technical terms.

`wenyan-lite` and `wenyan-ultra` still lacked equivalent runtime checks.

## 0.1.3 - 2026-04-16

A five-prompt Opus 4.7 comparison measured a one-point cache-hit decrease on activation. Results were 92 percent active and 93 percent inactive.

Steady-state cache hits improved by 10.8 percent during that run. Shorter outputs caused smaller cache-write tails, so this was not a placement property.

Total session cost fell by 55 percent in that workload. Tool-heavy workloads remained unmeasured.

## 0.1.2 - 2026-04-16

This release added the changelog and separated completed checks from pending checks. Runtime behavior did not change.

## 0.1.1 - 2026-04-16

Document exemption rules became narrower after technical chat bypassed terse output. Technical questions, comparisons, recommendations, reviews, and debugging stayed concise.

A second persistence reminder reduced style drift in long sessions. `/caveman diff` began reporting mode, hash, length, and injected text.

Broken private documentation links were removed. Cache claims were reduced until matched testing existed.

## 0.1.0 - 2026-04-16

Initial release added seven modes, persistent configuration, `/caveman`, status display, vendored rules, and deterministic prompt caching.

Mode `off` was the installation default. The extension used `before_agent_start` without changing tool results or message history.
