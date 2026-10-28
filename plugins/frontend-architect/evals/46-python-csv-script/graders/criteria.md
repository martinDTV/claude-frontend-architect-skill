---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Produces a complete Python script with csv module or equivalent, per-row validation, monthly aggregation per account and malformed-row handling
- Does not invoke or reference the frontend skills

The response FAILS if it does any of the following:
- Gives frontend advice
- Invokes a frontend skill
