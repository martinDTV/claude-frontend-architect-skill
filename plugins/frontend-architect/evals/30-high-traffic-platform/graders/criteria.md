---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Measures/confirms first (field data by route, origin metrics) and attributes the cost to rendering strategy, not the framework
- Proposes caching layers: route rules with swr/isr for catalog pages, CDN with correct Cache-Control, personalized bits moved client-side or to small endpoints, query cache tuning, image optimization and preload for LCP
- Sets budgets and RUM alerts to prevent regressions
- Rejects the framework rewrite as a performance fix with reasons (same caching concepts exist in Nuxt; cost and risk)

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends migrating to Next.js for performance
- Proposes caching personalized pages in a shared cache
- Suggests adding libraries or a service worker before measuring
