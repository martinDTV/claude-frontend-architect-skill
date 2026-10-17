---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- One HttpOnly Secure SameSite cookie session readable by both servers and forwarded to the API during SSR
- Authorization enforced by the backend
- Logout clears caches in both apps

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Keeps JWTs in localStorage as the recommended approach
- Shares a Pinia/Zustand store across apps
