---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Proposes feature folders per domain with public index.ts
- Keeps app/ routes thin and shared UI domain-free
- Defines import rules and proposes enforcing them (dependency-cruiser or eslint boundaries)
- Suggests an incremental migration

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Proposes microfrontends or a monorepo
- Proposes a big-bang rewrite
