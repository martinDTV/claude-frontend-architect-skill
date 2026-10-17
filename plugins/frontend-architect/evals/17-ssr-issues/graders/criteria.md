---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Identifies the module-level instance with mutable Authorization as a cross-request leak and moves creation inside the plugin per request
- Identifies relative baseURL failing on the server
- Identifies Date.now and localStorage during setup as hydration/SSR hazards with fixes

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Says the code is fine for SSR
