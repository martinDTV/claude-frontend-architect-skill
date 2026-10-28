---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Design system shared by a Nuxt UI app and a shadcn/ui app with dark mode and three accent lines"
expected_outcome: "Three token tiers emitted as CSS variables for both; per-framework components; Storybook and governance; no cross-framework components"
tags: ["activation:architect", "domain:architecture", "domain:visual"]
---
We need a design system shared by a Nuxt app (Nuxt UI) and a Next.js app (shadcn/ui). Brand has light and dark mode and three accent colors for product lines. Where do tokens live and what gets shared?
