---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Restructure a Nuxt 4 operations dashboard module and make it look professional for all-day desktop use"
expected_outcome: "Module boundaries and data layer decisions plus density, hierarchy and token decisions; no Three.js; no store for server data"
tags: ["activation:both", "domain:architecture", "domain:visual", "domain:vue-nuxt", "suite:smoke"]
---
Our Nuxt 4 + Nuxt UI operations dashboard module (`pages/operaciones/*`, 11 components in `components/operaciones/`, three flat composables) is used by supervisors on laptops for eight hours a day. It looks like a template, filters live in component state, and tasks are fetched into a Pinia store. Restructure the module and make it look professional for all-day desktop use. There is no repository available in this session: answer from this description with the target structure, the data and state decisions, and the visual direction, instead of asking for the code.
