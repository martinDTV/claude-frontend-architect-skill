---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Two apps behind one domain each keep a JWT in localStorage; how to share authentication safely"
expected_outcome: "One HttpOnly cookie session forwarded during SSR, backend authorization, logout clears both apps"
tags: ["activation:architect", "domain:security", "say-no"]
---
How do the Nuxt and Next.js apps behind the same domain share authentication safely? Today each app stores a JWT in localStorage.
