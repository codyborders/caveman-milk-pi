# Pilot-v1 Benchmark Audit

Source: immutable pilot-v1 results and fixtures. Replacement metadata comes only from regression-v2 requirements[].

| Case ID | Task class | Grounding status | Hard requirements | Protected content | Compression policy | Pilot-v1 issue | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `technical-explanation-r1` | explanation | fact-sufficient | term | cache_key | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `technical-explanation-r2` | explanation | fact-sufficient | term | cache_key | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `technical-explanation-r3` | explanation | fact-sufficient | term | cache_key | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `comparison-r1` | under-specified | clarification-required | grounding | none | eligible (target 0.85) | Prompt lacked facts. Old judging rewarded unsupported specificity | Revised fixture and requirements |
| `comparison-r2` | under-specified | clarification-required | grounding | none | eligible (target 0.85) | Prompt lacked facts. Old judging rewarded unsupported specificity | Revised fixture and requirements |
| `comparison-r3` | under-specified | clarification-required | grounding | none | eligible (target 0.85) | Prompt lacked facts. Old judging rewarded unsupported specificity | Revised fixture and requirements |
| `negation-r1` | short-factual | fact-sufficient | negation | Do not delete backups. | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `negation-r2` | short-factual | fact-sufficient | negation | Do not delete backups. | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `negation-r3` | short-factual | fact-sufficient | negation | Do not delete backups. | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `ordered-migration-r1` | structured-instructions | fact-sufficient | steps | 5 | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `ordered-migration-r2` | structured-instructions | fact-sufficient | steps | 5 | eligible (target 0.85) | Hard check failure in full arm | Revised fixture and requirements |
| `ordered-migration-r3` | structured-instructions | fact-sufficient | steps | 5 | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `security-warning-r1` | safety-sensitive | fact-sufficient | warning | SECURITY WARNING, credentials, do not share | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `security-warning-r2` | safety-sensitive | fact-sufficient | warning | SECURITY WARNING, credentials, do not share | exempt | Universal compression gate conflicted with the prompt exemption. Hard check failure in off arm | Revised fixture and requirements |
| `security-warning-r3` | safety-sensitive | fact-sufficient | warning | SECURITY WARNING, credentials, do not share | exempt | Universal compression gate conflicted with the prompt exemption. Hard check failure in off arm | Revised fixture and requirements |
| `irreversible-confirmation-r1` | irreversible-action | fact-sufficient | confirmation | cannot be undone | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `irreversible-confirmation-r2` | irreversible-action | fact-sufficient | confirmation | cannot be undone | exempt | Universal compression gate conflicted with the prompt exemption. Hard check failure in lite arm | Revised fixture and requirements |
| `irreversible-confirmation-r3` | irreversible-action | fact-sufficient | confirmation | cannot be undone | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `code-generation-r1` | technical-answer | fact-sufficient | code | parsePort | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `code-generation-r2` | technical-answer | fact-sufficient | code | parsePort | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `code-generation-r3` | technical-answer | fact-sufficient | code | parsePort | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `file-writing-r1` | file-output | fact-sufficient | prose, heading | Installation | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `file-writing-r2` | file-output | fact-sufficient | prose, heading | Installation | exempt | Universal compression gate conflicted with the prompt exemption. Hard check failure in lite arm | Revised fixture and requirements |
| `file-writing-r3` | file-output | fact-sufficient | prose, heading | Installation | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `commit-pr-r1` | commit | fact-sufficient | prose, term | Config migration | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `commit-pr-r2` | commit | fact-sufficient | prose, term | Config migration | exempt | Universal compression gate conflicted with the prompt exemption. Hard check failure in off arm | Revised fixture and requirements |
| `commit-pr-r3` | commit | fact-sufficient | prose, term | Config migration | exempt | Universal compression gate conflicted with the prompt exemption. Hard check failure in off arm | Revised fixture and requirements |
| `tool-argument-r1` | file-output | fact-sufficient | tool, term | write_artifact, Configuration remains valid after restart. | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `tool-argument-r2` | file-output | fact-sufficient | tool, term | write_artifact, Configuration remains valid after restart. | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `tool-argument-r3` | file-output | fact-sufficient | tool, term | write_artifact, Configuration remains valid after restart. | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `tutorial-r1` | tutorial | fact-sufficient | paragraphs, heading | 4, Setup | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `tutorial-r2` | tutorial | fact-sufficient | paragraphs, heading | 4, Setup | exempt | Universal compression gate conflicted with the prompt exemption | Revised fixture and requirements |
| `tutorial-r3` | tutorial | fact-sufficient | paragraphs, heading | 4, Setup | exempt | Universal compression gate conflicted with the prompt exemption. Hard check failure in full arm | Revised fixture and requirements |
| `one-line-r1` | under-specified | clarification-required | grounding | none | eligible (target 0.85) | Prompt lacked facts. Old judging rewarded unsupported specificity | Revised fixture and requirements |
| `one-line-r2` | under-specified | clarification-required | grounding | none | eligible (target 0.85) | Prompt lacked facts. Old judging rewarded unsupported specificity | Revised fixture and requirements |
| `one-line-r3` | under-specified | clarification-required | grounding | none | eligible (target 0.85) | Prompt lacked facts. Old judging rewarded unsupported specificity | Revised fixture and requirements |
| `clarification-r1` | structured-instructions | fact-sufficient | term | before deployment | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `clarification-r2` | structured-instructions | fact-sufficient | term | before deployment | eligible (target 0.85) | Hard check failure in lite arm | Revised fixture and requirements |
| `clarification-r3` | structured-instructions | fact-sufficient | term | before deployment | eligible (target 0.85) | Hard check failure in lite arm | Revised fixture and requirements |
| `wenyan-chinese-r1` | technical-answer | fact-sufficient | term | cache key | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `wenyan-chinese-r2` | technical-answer | fact-sufficient | term | cache key | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `wenyan-chinese-r3` | technical-answer | fact-sufficient | term | cache key | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `wenyan-english-r1` | technical-answer | fact-sufficient | term | request timeout | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |
| `wenyan-english-r2` | technical-answer | fact-sufficient | term | request timeout | eligible (target 0.85) | Hard check failure in full arm | Revised fixture and requirements |
| `wenyan-english-r3` | technical-answer | fact-sufficient | term | request timeout | eligible (target 0.85) | Old compression or judge scores were coupled to hard status | Revised fixture and requirements |

## Disposition Summary

| Disposition | Rows |
| --- | ---: |
| Revised fixture and requirements | 45 |
