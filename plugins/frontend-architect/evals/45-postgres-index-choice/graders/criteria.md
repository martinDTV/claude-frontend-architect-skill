---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Recommends a composite B-tree index with clinic_id first and starts_at second (or an equivalent justified choice) and explains selectivity and sort use
- Does not invoke or reference the frontend skills

The response FAILS if it does any of the following:
- Gives frontend advice
- Invokes a frontend skill
