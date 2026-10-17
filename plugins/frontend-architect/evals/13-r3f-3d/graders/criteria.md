---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Client Component loaded with next/dynamic ssr:false and a poster fallback
- Mutations in useFrame via refs, Suspense for loaders, drei helpers
- Respects reduced motion and checks React peer range of R3F

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Calls setState every frame
- Puts the Canvas in a Server Component
