---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Structure a new scheduling module in a Nuxt 4 back-office and decide how its screens should look and move for dispatchers who use them all day"
expected_outcome: "Module boundaries, public entry, state and data decisions from the architecture side; density, hierarchy, tokens and restrained motion decisions from the visual side; both skills fire"
tags: ["activation:both", "domain:architecture", "domain:visual", "domain:vue-nuxt", "domain:state"]
---
We are adding a scheduling module to our Nuxt 4 + Nuxt UI back-office: a week calendar of crews and jobs, a side panel with the selected job, and drag-to-reassign between crews. Dispatchers will keep it open on a second monitor for whole shifts. We need two things decided together: how to structure the module so it does not leak into the other domains (where its composables, components, stores and types live, what it publishes, how it fetches and caches jobs), and how the screens should look and move so they stay readable and calm for eight hours (density, hierarchy, status color, what animates on reassignment and what must not). There is no repository available in this session: answer from this description with the target structure and the visual direction instead of asking for the code.
