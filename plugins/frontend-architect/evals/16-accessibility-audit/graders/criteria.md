---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Flags div as button (use <button>), placeholder as label (add label), error only by color and not announced (role=alert, aria-describedby/aria-invalid)
- References WCAG criteria or user impact and gives the fixed markup

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Only suggests adding ARIA roles to the div instead of using a native button
