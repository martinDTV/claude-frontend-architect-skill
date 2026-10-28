---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Persist theme, sidebar and a draft; PM suggests keeping the access token in localStorage"
expected_outcome: "Persist only preferences and the draft with expiry; HttpOnly cookie session instead of tokens in storage"
tags: ["activation:architect", "domain:vue-nuxt", "domain:state", "domain:security", "say-no"]
---
Users want their theme, sidebar state and an unsent support-ticket draft to survive reloads in our Vue/Nuxt app. The PM also suggested keeping the access token in localStorage so users stay logged in. What do you recommend?
