---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Clinic SaaS with per-clinic subdomains, client-only panel and SSR public site asking about session, tenant isolation, caching and PHI"
expected_outcome: "Cookie or BFF session, tenant in every key and cleared on switch, private no-store, PHI never persisted, backend authorizes"
tags: ["activation:architect", "domain:security", "domain:vue-nuxt"]
---
Clinic SaaS in Nuxt 4 (panel with ssr: false under /app, public site SSR). Each clinic is a tenant on its own subdomain; doctors see patients and clinical notes. Tell me how to handle session, tenant isolation, caching and sensitive data in the frontend.
