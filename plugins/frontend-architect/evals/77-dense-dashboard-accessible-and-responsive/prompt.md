---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Rebuild a Nuxt 4 operations dashboard module: restructure it, and make it accessible for screen-reader and keyboard-only supervisors and usable on a 13-inch laptop at 125% zoom and on a tablet"
expected_outcome: "Module boundaries and data layer from the architecture side; density, hierarchy and tokens, keyboard and screen-reader requirements, responsive matrix and a tiered verification plan (static audit now, browser mode on a local build, human review for WCAG) from the visual and accessibility side; both skills fire"
tags: ["activation:both", "domain:architecture", "domain:visual", "domain:accessibility", "domain:vue-nuxt"]
---

We have to rebuild the operations dashboard module of our Nuxt 4 + Nuxt UI back-office: today it is `pages/ops/*`, nine components in `components/ops/`, two flat auto-imported composables, and incidents are loaded into a Pinia store. Besides restructuring it so it stops leaking into other domains, the new version must be accessible (two supervisors use a screen reader and several navigate by keyboard only) and must stay usable on a 13-inch laptop at 125% zoom and on a tablet in the field. Give us the target structure and data decisions, the visual direction and density for a screen watched all shift, the accessibility requirements, the responsive matrix, and how we will verify all of it. There is no repository available in this session: answer from this description instead of asking for the code.
