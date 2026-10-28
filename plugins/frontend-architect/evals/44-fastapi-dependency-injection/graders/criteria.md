---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Answers the FastAPI question itself (Depends, yield dependencies for the session, request scope, dependency_overrides in tests)
- Does not invoke or reference the frontend-architect or creative-frontend skills

The response FAILS if it does any of the following:
- Gives frontend architecture, Nuxt or Next.js advice
- Invokes a frontend skill
