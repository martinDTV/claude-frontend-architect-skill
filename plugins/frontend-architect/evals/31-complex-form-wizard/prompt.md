---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Five-step onboarding wizard in Nuxt UI with uploads, bank data, dynamic users and 422 field errors"
expected_outcome: "Schema-first validation, one 422 mapper, step in URL, versioned draft with expiry, signed uploads, accessible errors"
tags: ["activation:architect", "domain:vue-nuxt", "domain:state"]
---
Five-step onboarding wizard in Nuxt 4 + Nuxt UI: company data, documents upload, bank account, users (dynamic list), review. Users abandon and return days later. The backend returns 422 with field errors. How do we build it?
