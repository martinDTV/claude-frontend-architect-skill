---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A domain matrix that allows two domains to depend on each other in both directions; how a policy-aware audit should report cycles, forbidden pairs, exceptions and type-only coupling"
expected_outcome: "Policy in the audit config, allowed cycles reported as information not violations, forbidden pairs split into runtime and type-only, exceptions with reason and dates kept visible"
tags: ["activation:architect", "domain:architecture", "domain:vue-nuxt", "domain:audit"]
---

Our Nuxt 4 modular monolith has a written matrix of allowed dependencies between business domains. It allows `proyecto → operaciones` and `operaciones → proyecto` on purpose (the project hub and the works core ship together), forbids `operaciones → comercial`, and tolerates `administracion → comercial` until a planned refactor because two types still live in `types/crm.ts`. The dependency audit currently reports the `proyecto ↔ operaciones` cycle as a violation, counts the `administracion → comercial` type-only imports the same as runtime calls, and knows nothing about the tolerance. How should we express this policy for the audit, and how should each of those three situations be reported? There is no repository available in this session: answer from this description.
