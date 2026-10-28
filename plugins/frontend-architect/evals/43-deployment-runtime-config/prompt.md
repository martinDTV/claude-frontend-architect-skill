---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Nuxt app is deployed twice: an old Docker SSR path from a 'prod' branch and a new static build in S3+CloudFront from 'main', with NUXT_PUBLIC_* baked at build time and a different value per environment. Tenants will get their own subdomains. How should deployment and configuration work?
