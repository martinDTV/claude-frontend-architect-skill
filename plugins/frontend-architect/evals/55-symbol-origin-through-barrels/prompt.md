---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Where does an imported name really live when it comes through a barrel with re-exports and export *; how to attribute the dependency to the owning file"
expected_outcome: "Distinguishes the barrel hop from the declaring file, uses symbol origins (semantic engine, --follow-reexports) instead of guessing, and explains what export * hides"
tags: ["activation:architect", "domain:architecture", "domain:vue-nuxt", "domain:audit"]
---

In our Nuxt 4 + TypeScript app, `app/domains/sales/index.ts` is a barrel: it has `export { useLeads } from '~/composables/useLeads'`, `export type { Lead } from '~/types/sales'` and `export * from './eventos'`. A page in another domain imports `{ useLeads, registrarEvento }` from `~/domains/sales`. Our dependency report only shows an edge from the page to `index.ts`, so the team concluded the page depends on "the barrel" and nothing else. Which files does that page really depend on, how do we attribute each imported name to the file that declares it (including names that arrive through `export *`), and how should the report show the difference between the barrel hop and the owner? There is no repository available in this session: answer from this description.
