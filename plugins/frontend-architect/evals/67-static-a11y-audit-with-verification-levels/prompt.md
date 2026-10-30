---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Accessibility audit 'with proof' of a Nuxt component: image without alt, placeholder-only input, icon-only button whose only child is an icon component"
expected_outcome: "Separates what the markup proves (static), what needs reading (the icon child may render a name) and what needs a browser (bound alt, real accessible names, contrast); names ui-audit.mjs; concrete fixes; never calls it WCAG conformance"
tags: ["activation:architect", "domain:accessibility", "domain:audit", "domain:vue-nuxt"]
---

Our QA lead wants an accessibility audit "with proof, not opinions" of a Nuxt 4 product card before we touch it. The template is, in short: `<img :src="product.image">` with no `alt` at all; `<input v-model="query" placeholder="Search products">` with no label, wrapper or ARIA attribute; and `<button @click="remove(product.id)"><IconTrash /></button>` with no text and no `aria-label`. A teammate says binding `:alt="product.name"` on the image closes that finding. For each of the three, tell us what can be proven from the markup alone, what needs someone to read more code, what only a rendered page can tell, and what the fixes are. There is no repository available in this session: answer from this description.
