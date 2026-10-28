---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "How to map which business domains depend on which in a Nuxt 4 app with flat auto-imported composables and a layer"
expected_outcome: "Uses the generated .nuxt metadata as the authoritative map, explicit imports from module entries for enforcement, and a verified vs inferred report"
tags: ["activation:architect", "domain:architecture", "domain:vue-nuxt", "domain:audit"]
---

Our Nuxt 4 app has 46 composables flat in `app/composables/` (all auto-imported), components grouped by business area under `app/components/<area>/`, and a local layer in `layers/base/` with shared composables and components. Nothing imports anything explicitly, so nobody can tell which business areas depend on which. A teammate proposes grepping for `import` statements and drawing the graph by hand. How do we get a reliable dependency map between the areas, and how do we keep it reliable? There is no repository available in this session: answer from this description.
