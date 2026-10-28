---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Enables strictness incrementally (per flag or per folder), prioritizing noImplicitAny and strictNullChecks, with vue-tsc/nuxt typecheck in CI
- Replaces casts with runtime validation (Zod/Valibot) at the API boundary and inferred types; models UI state as a discriminated union
- Addresses Nuxt typing: runtime config, injected $api, page meta; uses unknown + narrowing instead of any
- Sequences work by risk and keeps feature work flowing

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Proposes flipping strict: true in one PR for the whole codebase without a plan
- Keeps `as` casts on API responses as the solution
- Suggests disabling type checks in CI
