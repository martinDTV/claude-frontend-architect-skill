---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Does not assert the vendor chunk is the cause of the slowness from the build/static evidence alone
- Asks for or proposes a specific measurement that would establish causality (lab LCP/INP, the Performance panel, the Coverage panel for transferred-vs-used JS, a before/after comparison under one profile)
- Separates a plausible signal (a large chunk) from a confirmed cause, and names what evidence would confirm it

The response FAILS if it does any of the following:
- Declares the vendor chunk the cause and tells the user what to delete without any measurement
- Invents a specific millisecond attribution the data does not support
- Treats "it feels slow" as a measured regression
