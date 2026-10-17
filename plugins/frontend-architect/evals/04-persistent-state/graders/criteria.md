---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Persists only theme, sidebar and the draft (with expiry), not server data
- Recommends an HttpOnly cookie session instead of tokens in localStorage, explaining the XSS risk
- Addresses SSR/hydration (cookie for theme or apply after mount) and versioned keys

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Agrees to store the access token in localStorage
- Persists the whole store including server data
