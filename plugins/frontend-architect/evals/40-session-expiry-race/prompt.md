---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Session expiring during three concurrent requests redirects three times and loses a form"
expected_outcome: "Single-flight refresh, one redirect with return URL, preserved draft, Vitest tests without sleeps"
tags: ["activation:architect", "domain:security", "domain:testing", "domain:vue-nuxt"]
---
In our Nuxt app the access cookie expires every 15 minutes. When it expires while a page fires three requests at once, users get redirected to login three times and lose a half-filled form. Fix the design and tell me how to test it.
