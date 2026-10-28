---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Forty-screen Nuxt B2B app with cross-screen warehouse selection and a draft order builder"
expected_outcome: "State classified by kind: client state in per-feature Pinia stores, server data in a query cache, feature-based structure"
tags: ["activation:architect", "domain:vue-nuxt", "domain:state", "domain:architecture"]
---
We have a Nuxt 4 B2B app with 40 screens across orders, inventory, billing and settings, 5 developers. Users pick an active warehouse that affects almost every screen, and there is a multi-step order builder that keeps a draft cart across pages. Where should state live?
