---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Nuxt checkout form producing duplicate orders and no feedback: which form checks exist, what the static audit can see, what needs browser mode with submissions, and where that may run"
expected_outcome: "Full form checklist; static findings named as heuristics; form-double-submit confirmed only in browser mode with --allow-submit on local or staging; local/remote/unknown state reasoning for the pending flag; no production submissions, no global store"
tags: ["activation:architect", "domain:forms", "domain:vue-nuxt", "domain:audit"]
---

Our Nuxt 4 checkout form (`pages/checkout.vue`, a `useCheckout` composable, Nuxt UI form components, order creation through a `$fetch` POST to `/api/orders`) is producing duplicate orders, and customers say that nothing happens after they press Pay, so they press it again. Give us the list of things to check in this form, tell us which of them the plugin's tools can see without running the app and which need the browser mode, and tell us how and where the browser mode may be used for this safely. There is no repository available in this session: answer from this description.
