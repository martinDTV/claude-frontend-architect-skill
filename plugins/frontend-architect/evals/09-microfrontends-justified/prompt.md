---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Nuxt storefront and Next.js dashboard from two teams must share one domain and login and deploy weekly"
expected_outcome: "Route-based composition behind a proxy, one HttpOnly session cookie, shared tokens and contracts, anchor navigation"
tags: ["activation:architect", "domain:architecture", "domain:security"]
---
After an acquisition we have a Nuxt storefront (team A, 8 devs) and a Next.js merchant dashboard (team B, 7 devs) that must live under one domain, share login and deploy independently weekly. How should we integrate them?
