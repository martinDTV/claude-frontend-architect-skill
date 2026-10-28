---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Nuxt SSR app with a module-level tenant cache and a late response from the previous tenant landing in the dashboard"
expected_outcome: "Per-request state for the tenant, identity epoch and abort on switch, tenant in query keys, SSR concurrency test; demonstrated leak separated from hypothetical risk"
tags: ["activation:architect", "domain:security", "domain:state", "domain:vue-nuxt", "domain:testing"]
---

Nuxt 4 app rendered with SSR (not `ssr: false`), multi-tenant on one origin with an organization switcher. `app/composables/useTenant.ts` has `let currentTenant: string | null = null` at module level, set from the session on first use and read by the API client to add an `X-Tenant` header. Separately, on the dashboard a slow KPI request started under tenant A resolves after the user switched to tenant B and its numbers appear on B's screen. The team says "it only happens sometimes". What is wrong, what is proven versus suspected, and what do we change and test? There is no repository available in this session: answer from this description.
