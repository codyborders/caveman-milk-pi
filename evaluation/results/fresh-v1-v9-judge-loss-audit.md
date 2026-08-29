# Fresh-v1 judge-loss audit (v1)

This audit covers 16 fresh-v1 judge losses. Eight involve `lite`, and eight involve `full`.

Complete case records are in `fresh-v1-v9-judge-loss-audit.json`. Each record includes raw responses and all requested audit fields. Each table row gives its JSON pointer.

| Source | SHA-256 |
| --- | --- |
| `evaluation/results/fresh-v1-v9.json` | `a40d29aa6d4ec9f4dff573caef559ff3f59f8fc5c52ff30f0121e36efab98ac2` |
| `scripts/evaluation-fixtures-fresh-v1.json` | `d961c987a01da8fe2280037489cca42e6c1f303fc06e9d570495dffde3818e3e` |

The generator is `scripts/eval/fresh-v1-loss-audit.mjs`. It made 0 external model calls.

## Classification totals

| Classification | Count |
| --- | ---: |
| Invalid fixture caused by missing source facts | 10 |
| Actual required-information loss | 1 |
| Other | 5 |

Case codes are IF for invalid fixtures, RI for required-information loss, and OT for other findings.

Ten losses come from commit and configuration tasks with missing source facts. One `lite` response omits the exact lowercase phrase `do not share`. Its sentence-word check is an incorrect word-count validator. Five losses concern technical overstatement or judge style preference.

## Case index

| JSON pointer | Mode | Category | Repetition | Quality score off-active | Code |
| --- | --- | --- | ---: | ---: | --- |
| `/losses/0` | full | fresh-writing | 1 | 8-7 | OT |
| `/losses/1` | full | fresh-file | 2 | 8-7 | IF |
| `/losses/2` | full | fresh-writing | 2 | 8-7 | OT |
| `/losses/3` | full | fresh-file | 3 | 7-6 | IF |
| `/losses/4` | full | fresh-writing | 3 | 8-7 | OT |
| `/losses/5` | full | fresh-commit | 4 | 8-6 | IF |
| `/losses/6` | full | fresh-commit | 5 | 8-6 | IF |
| `/losses/7` | full | fresh-file | 5 | 8-6 | IF |
| `/losses/8` | lite | fresh-commit | 2 | 8-7 | IF |
| `/losses/9` | lite | fresh-commit | 3 | 8-6 | IF |
| `/losses/10` | lite | fresh-file | 4 | 8-4 | IF |
| `/losses/11` | lite | fresh-safety | 4 | 8-6 | RI |
| `/losses/12` | lite | fresh-commit | 5 | 8-6 | IF |
| `/losses/13` | lite | fresh-explanation | 5 | 8-7 | OT |
| `/losses/14` | lite | fresh-file | 5 | 8-7 | IF |
| `/losses/15` | lite | fresh-writing | 5 | 8-7 | OT |
