---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Restructure a Next.js app with 120 mixed components into domains"
expected_outcome: "Feature folders with public index.ts, thin routes, enforced import rules, incremental migration; no microfrontends or monorepo"
tags: ["activation:architect", "domain:react-next", "domain:architecture", "say-no"]
---
Restructure this Next.js app folder layout: app/, components/ (120 files mixing ui and business), hooks/, services/, utils/, types/. Domains: catalog, cart, checkout, accounts. 4 developers. The code is not available in this session; propose the target layout, the import rules and the migration order from this description.
