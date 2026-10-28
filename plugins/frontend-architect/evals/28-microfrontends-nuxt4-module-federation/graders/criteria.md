---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Reports the verified status: @module-federation/nuxt is a 0.x beta requiring nuxt >= 4.5.1, no official Nuxt support, Vue/Pinia/Nuxt UI must be true singletons, one <UApp>/theme per page, SSR remotes run with host privileges
- Concludes not now: no second team exists; proposes Nuxt Layers or a modular monolith with enforced boundaries, and route-based composition behind a proxy/CDN as the documented path if a second team appears
- Gives measurable criteria to reopen the decision (teams, release blocking, tech divergence, isolation needs) and prerequisites (clean boundaries, shared base package, tests, one pipeline, observability)

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends adopting @module-federation/nuxt now
- Claims Module Federation has official Nuxt support
- Justifies microfrontends with 'next year when we grow'
