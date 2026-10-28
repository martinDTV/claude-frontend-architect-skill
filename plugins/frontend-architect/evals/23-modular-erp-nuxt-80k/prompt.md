---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Eighty-thousand-line Nuxt ERP with flat auto-imported composables asked to match eight backend microservices with microfrontends"
expected_outcome: "No microfrontends; modular monolith with public entries, explicit imports, enforcement and incremental migration; tests first"
tags: ["activation:architect", "domain:architecture", "domain:vue-nuxt", "domain:audit", "say-no", "suite:smoke"]
---
Our Nuxt 4 ERP-like app has 80,000 lines: 83 pages, 46 flat auto-imported composables, components grouped by folder per business area (crm, operations, hr, billing), one Pinia store, no tests, one developer plus one part-time. The backend is 8 microservices. Management asks whether we should move to microfrontends to "match the backend". What do you recommend?
