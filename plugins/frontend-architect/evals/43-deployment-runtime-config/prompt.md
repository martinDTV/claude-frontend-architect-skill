---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Nuxt app deployed through two pipelines with baked NUXT_PUBLIC values and tenant subdomains coming"
expected_outcome: "One deployment path, build once and promote with runtime config, tenant from host at runtime, cache headers and rollback, CI gates"
tags: ["activation:architect", "domain:delivery", "domain:vue-nuxt"]
---
Our Nuxt app is deployed twice: an old Docker SSR path from a 'prod' branch and a new static build in S3+CloudFront from 'main', with NUXT_PUBLIC_* baked at build time and a different value per environment. Tenants will get their own subdomains. How should deployment and configuration work?
