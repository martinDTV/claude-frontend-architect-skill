---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Refactor a 900-line Vue component that fetches in onMounted into a god store"
expected_outcome: "Split by state kind, extract service and composables, split the component incrementally with tests"
tags: ["activation:architect", "domain:vue-nuxt", "domain:state", "domain:architecture"]
---
Refactor: a 900-line Vue component fetches users with axios in onMounted, stores them in a Pinia store 'useAppStore' that also holds theme, cart, filters and the logged user. Plan the refactor.
