---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A module removed an export from its index.ts that another module used; how to prevent breaking public contracts inside one app"
expected_outcome: "Baseline of public surfaces diffed in CI, deprecate-then-remove, consumers migrated in the same PR, TypeScript as the first alarm"
tags: ["activation:architect", "domain:architecture", "domain:testing"]
---

In our modular Nuxt app, the `scheduling` team renamed `useAvailableSlots` to `useSlotAvailability` in `app/modules/scheduling/index.ts` and shipped it. The `billing` module imported the old name through the entry and broke in staging. Both modules live in the same repository and deploy together. How do we prevent this class of problem without turning each module into a separately versioned package? There is no repository available in this session: answer from this description.
