---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Two Nuxt apps copy-pasting tokens, API types and session helpers, with a React Native app coming"
expected_outcome: "Yes to a monorepo with pnpm plus Turborepo or Nx; share tokens, contracts and config, not business logic; consider layers"
tags: ["activation:architect", "domain:architecture"]
---
We have a Nuxt customer app, a Nuxt admin app, and are about to add a React Native app. The two web apps already copy-paste the design tokens, the API types (from OpenAPI) and the session helpers. Should we move to a monorepo? What goes in it?
