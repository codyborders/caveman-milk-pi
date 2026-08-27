# Changelog

This file records caveman-milk-pi releases. Version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.4.0-beta.1 - Unreleased

### Added

Configuration now has schema validation and migration for older flat files. Atomic writes use random temporary names and clean failed writes.

Tests now cover commands, Pi lifecycle hooks, configuration, prompt generation, and evaluation. Offline evaluation contains 105 matched cases. Anthropic execution requires explicit paid-run authorization.

### Changed

Runtime prompts now use one versioned contract instead of filtered markdown. Active prompts contain 603 to 706 characters.

Development now targets Pi `0.84.3`. Vendored rules match caveman commit `17f9f2ec2377b0bfe16b52ee03a462e7f0a02bc8`.

Documentation now separates prompt-size measurements from provider cost claims.

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
