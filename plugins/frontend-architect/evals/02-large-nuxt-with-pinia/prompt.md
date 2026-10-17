---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

We have a Nuxt 4 B2B app with 40 screens across orders, inventory, billing and settings, 5 developers. Users pick an active warehouse that affects almost every screen, and there is a multi-step order builder that keeps a draft cart across pages. Where should state live?
