---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Says no to microfrontends and explains why: one team, no release coupling, backend microservices are not a criterion; distinguishes organizational from code-size problems
- Recommends a modular monolith: modules by business capability with public index.ts, explicit imports instead of auto-imports for module code, shell/core layer, enforcement with dependency-cruiser (and mentions the plugin's domain-deps tool or equivalent for auto-import edges)
- Proposes an incremental, URL-preserving migration with characterization tests first and measurable criteria to reopen the decision
- Flags that missing tests and oversized pages must be addressed before any restructuring

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends microfrontends or Module Federation
- Proposes a big-bang rewrite or a framework change
- Maps frontend modules one-to-one to backend services without analysis
