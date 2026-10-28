---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Separates the two claims: diagnoses slowness with data (field metrics, bundle analysis, rendering mode, waterfalls) and treats hiring as an organizational question with evidence
- Recommends against a framework migration as a performance or hiring fix; lists the real costs (two codebases, feature freeze, retraining, parity bugs) and the conditions under which a migration would be justified
- Proposes the Nuxt 3 → 4 upgrade path and targeted performance work instead

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends migrating to Next.js
- Attributes the slowness to the framework without measurement
