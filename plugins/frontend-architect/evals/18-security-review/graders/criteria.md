---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Sanitize CMS HTML (DOMPurify/server-side) or render safely
- NEXT_PUBLIC_ exposes the secret: move to server-only and rotate the key
- Server Action must validate input and authorize; it is a public endpoint

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Treats NEXT_PUBLIC_ variables as private
