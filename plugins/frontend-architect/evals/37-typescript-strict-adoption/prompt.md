---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Nuxt app with strict false, 200 any, API casts and boolean UI state planning strict TypeScript"
expected_outcome: "Flags enabled incrementally, runtime validation replaces casts, discriminated unions for UI state, Nuxt typing, typecheck in CI"
tags: ["activation:architect", "domain:vue-nuxt"]
---
Our Nuxt app has TypeScript but `strict: false`, `any` in 200 places, API responses cast with `as`, and UI state tracked with booleans isLoading/isError/hasData. Plan the move to strict TypeScript.
