---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Refactor: a 900-line Vue component fetches users with axios in onMounted, stores them in a Pinia store 'useAppStore' that also holds theme, cart, filters and the logged user. Plan the refactor.
