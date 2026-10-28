---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Operations dashboard in Nuxt 4 + Nuxt UI with KPIs, a trend chart, a 2,000-row task table and 30-second alerts"
expected_outcome: "Action-first visual density, server-side table with URL filters, query cache for alerts, lazy chart with text alternative"
tags: ["activation:both", "domain:visual", "domain:vue-nuxt", "domain:state"]
---
We are building an operations dashboard in Nuxt 4 + Nuxt UI for warehouse supervisors: 6 KPIs, a trend chart, a table of 2,000 open tasks with filters, and alerts that refresh every 30 seconds. Users are on laptops, 20 of them, all day. How should we design and build it?
