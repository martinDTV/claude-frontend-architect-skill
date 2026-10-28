---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Working ssr:false Nuxt app with module-level Axios and tokens in localStorage; consultant demands SSR and an auth rewrite"
expected_outcome: "Keep ssr:false unless a need appears; module-level client is an SSR blocker not a current leak; migrate tokens to cookie or BFF incrementally"
tags: ["activation:architect", "domain:vue-nuxt", "domain:security", "domain:architecture", "say-no"]
---
Existing Nuxt 4 app with ssr: false, Pinia 3, Axios instance created at module level with the token set in defaults after login, 17 useState keys, tokens in localStorage, deployed as static files to S3+CloudFront. Everything works. A consultant says we must enable SSR and rewrite the auth. What should we actually do?
