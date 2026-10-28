---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Six-page Nuxt 4 marketing site asking whether to add Pinia and Axios"
expected_outcome: "Stage 0 with useFetch and prerendering; no Pinia, no Axios, no feature layering"
tags: ["activation:architect", "domain:vue-nuxt", "domain:state", "domain:architecture", "say-no", "suite:smoke", "suite:activation"]
---
I'm building a Nuxt 4 marketing site with 6 pages: home, about, pricing, blog list, blog post and contact. Blog posts come from a REST endpoint. One developer. How should I structure it and where should the blog data live? Should I add Pinia and Axios?
