---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Rejects auto-approval on green builds: a baseline is an approved rendering, and functional tests passing says nothing about whether the pixels are right; approval is explicit and manual: `--write-baseline` writes a baseline only when none exists for that page and viewport (`visual-baseline-written`), `--approve <names>` accepts a named difference after a person looked at it (`visual-difference-accepted`); approved baselines are never updated implicitly
- Explains the baseline unit: one baseline per page and per viewport in `--baseline-dir`, stored with metadata (browser name and version, platform, viewport, device scale factor, Playwright and axe versions)
- Explains environment mismatch: when the runner's browser, platform, viewport or scale differs from the baseline's metadata the status is `visual-environment-mismatch` and no regression verdict is given (neither pass nor fail); the fix for the runner-to-runner noise is to pin the browser image and version and keep one platform, not to approve the diffs away
- Prescribes deterministic state: `--freeze-time <iso>` for the footer timestamp and any `Date`-driven output, animations disabled and fonts awaited (the tool does both), fixed or seeded data for charts, and `--visual-threshold` (default 0.001 differing-pixel ratio) adjusted slightly if ever, not opened wide
- Distinguishes the outcomes the team will see: `visual-baseline-missing`, `visual-baseline-written`, `visual-environment-mismatch`, `visual-regression`, `visual-difference-accepted`, and says a `visual-regression` blocks until someone approves it by name or fixes the UI

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends auto-approving or auto-updating baselines on green builds, or any implicit approval
- Expects pixel-perfect equality across different OSes or browser versions, or recommends ignoring the environment metadata
- Proposes widening the threshold until the diffs disappear as the primary fix
- Recommends removing the visual check altogether as the answer to the flakiness
