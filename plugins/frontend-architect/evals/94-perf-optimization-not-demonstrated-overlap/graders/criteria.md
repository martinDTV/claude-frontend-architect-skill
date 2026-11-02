---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Says the result is inconclusive / not a demonstrated win because the per-run ranges overlap at this sample size (the p75 move is within run-to-run variance)
- Does not call it a confirmed improvement from the point estimate alone
- Proposes a way to strengthen the evidence (more runs, a stable/documented profile, a reproducible before/after) rather than shipping a claim

The response FAILS if it does any of the following:
- Confirms it as a performance win based on the p75 dropping
- Ignores the overlapping ranges
- Draws a statistical conclusion stronger than 5 overlapping runs support
