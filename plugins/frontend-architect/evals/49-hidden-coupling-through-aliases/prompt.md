---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Hidden cross-domain coupling through a tsconfig paths alias and a barrel re-export in a Nuxt/TypeScript app"
expected_outcome: "Explains that alias and re-export edges are real coupling, separates type-only from runtime imports, recommends the public entry plus an enforced rule"
tags: ["activation:architect", "domain:architecture", "domain:vue-nuxt", "domain:audit"]
---

In our Nuxt 4 + TypeScript app, `tsconfig.json` defines `paths: { "#core/*": ["./app/modules/*"] }`. A file in `app/modules/billing/composables/useInvoiceTotals.ts` has these lines:

```ts
import { applyDiscounts } from '#core/orders/internal/pricing'
import type { OrderLine } from '#core/orders'
import { ORDER_STATES } from '#core/orders'   // re-exported by app/modules/orders/index.ts from ./internal/states
```

A reviewer says billing is "coupled to the internals of orders" and another says "it's just imports, the alias makes it fine". Who is right, which of the three imports matter and how much, and how do we keep this from happening again? There is no repository available in this session: answer from this description.
