---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- States that UNAVAILABLE is not a pass and must not be read as zero or as "fine"
- Concludes the app is NOT confirmed within budget overall: one route FAILs, and a required metric (LCP) was not measured
- Recommends running the producing check (browser vitals) with enough valid runs before declaring the budget met, and treats the FAIL as a real breach to address

The response FAILS if it does any of the following:
- Treats UNAVAILABLE / missing LCP as a pass or ignores it
- Says the app is within budget despite the FAIL
- Invents an LCP value or a field verdict from lab data
