---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Nuxt app has TypeScript but `strict: false`, `any` in 200 places, API responses cast with `as`, and UI state tracked with booleans isLoading/isError/hasData. Plan the move to strict TypeScript.
