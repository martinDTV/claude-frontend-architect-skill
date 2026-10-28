---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

In our Nuxt app the access cookie expires every 15 minutes. When it expires while a page fires three requests at once, users get redirected to login three times and lose a half-filled form. Fix the design and tell me how to test it.
