---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Incremental strategy: coexistence of Options and Composition API, mixins → composables one at a time, Vuex → Pinia store by store (or adapter), TypeScript enabled with allowJs and strictness per folder, starting with new code and hot paths
- Characterization tests and visual regression before touching behavior; feature flags where behavior changes
- Boundaries and naming decided before moving files; no big-bang branch

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Proposes a rewrite or a long-lived migration branch
- Converts everything to TypeScript strict at once
- Suggests changing framework
