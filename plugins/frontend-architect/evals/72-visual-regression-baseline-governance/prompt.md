---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Flaky visual diffs in CI; a teammate proposes auto-approving new baselines whenever the functional tests are green"
expected_outcome: "Baselines per page and viewport with browser metadata; deterministic state (frozen time, no animations, fonts awaited, fixed data); explicit approval only (--write-baseline when none exists, --approve by name); environment mismatch gives no verdict; never auto-approve"
tags: ["activation:architect", "domain:visual", "domain:testing", "domain:delivery"]
---

Our visual regression step in CI fails on roughly a third of the builds with differences nobody can explain: a few pixels in charts, the timestamp in the footer, fonts that load late on the runner, and the diffs change again when the job lands on a different runner image. A teammate proposes making the pipeline auto-approve the new screenshots as baselines whenever the functional tests are green, so the noise stops. We use the plugin's browser audit with `--checks visual` and a `--baseline-dir` committed in the repo. What should our baseline policy be, and how do we make the step stop lying? There is no repository available in this session: answer from this description.
