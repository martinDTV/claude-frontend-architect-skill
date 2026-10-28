---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Nuxt marketplace with 3M visits a day, saturated SSR origin and LCP 3.4 s; team proposes rewriting in Next.js"
expected_outcome: "Measure and attribute to rendering strategy; swr/isr route rules, CDN, personalization split, budgets and RUM; no rewrite"
tags: ["activation:architect", "domain:performance", "domain:architecture", "domain:vue-nuxt", "say-no"]
---
Our Nuxt 4 marketplace gets 3M visits/day; product pages are SSR per request and the origin is saturated at peaks; p75 LCP is 3.4 s. The team proposes rewriting in Next.js because "it caches better". Advise.
