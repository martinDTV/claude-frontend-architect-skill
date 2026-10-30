---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A linter flagged a Nuxt UI input wrapped in a FormField with a label prop as 'input without label'; the team wants aria-labels everywhere or the rule disabled"
expected_outcome: "Explains that a wrapper declaring a label-like prop encapsulates the labelling and the static audit counts it as encapsulated instead of reporting; names what still has to be verified at the wrapper; rejects redundant aria-labels, a global disable and the confirmed level"
tags: ["activation:architect", "domain:accessibility", "domain:vue-nuxt", "domain:audit", "say-no"]
---

An accessibility linter in our Nuxt 4 project flagged about 180 occurrences of `<FormField label="Email"><UInput v-model="email" /></FormField>` as "form input without label", severity high, and the dashboard treats them as confirmed defects. `FormField` is our own wrapper component that takes a `label` prop and passes the rest of the attributes down to the control. The team lead wants to close this fast: either add an `aria-label` to every `UInput` in the codebase, or disable the rule globally. Which should we do, and does the plugin's own audit report these too? There is no repository available in this session: answer from this description.
