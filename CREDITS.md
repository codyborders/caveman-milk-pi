# Credits

## caveman

caveman-milk-pi adapts the caveman response style by [Julius Brussee](https://github.com/JuliusBrussee). The original [caveman repository](https://github.com/JuliusBrussee/caveman) uses the MIT license.

Review used commit `17f9f2ec2377b0bfe16b52ee03a462e7f0a02bc8` from 2026-08-25. The source path was `skills/caveman/SKILL.md`. Vendored file `skill/SKILL.md` matches that source.

Runtime injection uses smaller constants derived from core upstream behavior. Upstream reductions from selected workloads do not transfer automatically to this extension. Upstream `docs/HONEST-NUMBERS.md` explains its measurement limits.

## Pi

This package uses the documented API from [pi-mono](https://github.com/badlogic/pi-mono). It registers `session_start`, `before_agent_start`, `registerCommand`, and `ctx.ui.setStatus`.

## Related projects

[condensed-milk](https://github.com/tomooshi/condensed-milk-pi) compresses tool output and older context. [pi-vcc](https://github.com/sting8k/pi-vcc) provides conversation compaction. These projects remain independent. Compatibility depends on matched tests against selected versions.
