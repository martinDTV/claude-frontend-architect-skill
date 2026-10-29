---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "When to use the semantic or the lexical engine of the audit scripts, how to point them at a compiler, and how to read the Analysis line and the resolution of each edge"
expected_outcome: "Correct use of --engine auto|semantic|lexical, --typescript and --vue-compiler, honest description of the fallbacks (TypeScript 7, pnpm layouts, no compiler), and how to read engine and resolution before trusting an edge"
tags: ["activation:architect", "domain:audit", "domain:vue-nuxt"]
---

We run the plugin's audit scripts in CI on three repositories: a Nuxt 4 app with pnpm (TypeScript is a transitive dependency, not in the root `node_modules`), a Vite + Vue app that just moved to the TypeScript 7 preview, and a Next.js app with TypeScript 5.9. Two of the reports say `engine: lexical` and one says `engine: semantic`, and a reviewer asks whether the lexical ones can be trusted, which flags to pass, and what the `resolution` column of an edge means. What do we tell them? There is no repository available in this session: answer from this description.
