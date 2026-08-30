# Targeted-v8 development audit

Status after offline validator correction: `PASS`. This was not the final blinded gate.

The development run evaluated commit `794dccfb93a2f21173275d08908fff18ccd242cc`, prompt contract v9, and targeted-v4 fixture SHA-256 `c4f3f865f2e394bff2e6a8fcf59db1708c7edcab390af137e58df033b98a67de`. It used Pi 0.84.3, `z-ai/glm-5.3`, medium thinking, seed `0xc0ffee0b`, and three repetitions. All 36 planned primary processes completed. Judge traffic was intentionally disabled for this development check.

The paid validator reported 35/36 hard passes. One valid full artifact used inline-code formatting around both requested fields. Validator v10 unwraps that formatting before prose validation. Offline correction yields 36/36 hard passes. No unsupported claim passed.

The clarified fixture removed prior file-inspection responses and free-form artifact additions. All `off`, `lite`, and `full` cases completed the requested task after correction.

This run only validates the development boundary. A ten-repetition run with blinded judging is still required before fresh-v1.