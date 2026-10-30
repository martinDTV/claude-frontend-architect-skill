---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A reviewer flagged window.matchMedia inside onMounted and a typeof window guarded read at module scope as hydration hazards and wants both behind ClientOnly"
expected_outcome: "Both are safe as written and the rule skips them; what would still be a problem is an initial state that differs between server and client and reaches the first paint; no ClientOnly around everything"
tags: ["activation:architect", "domain:ssr", "domain:vue-nuxt", "say-no"]
---

A reviewer went through our Nuxt 4 code with a checklist and marked two things as "hydration hazards, must fix": (1) in `components/AppSidebar.vue`, `onMounted(() => { collapsed.value = window.matchMedia('(max-width: 1024px)').matches })`, and (2) in `composables/useAnalytics.ts`, `const dnt = typeof window !== 'undefined' ? navigator.doNotTrack === '1' : false` at module scope. He wants both moved behind `<ClientOnly>`, and ideally "everything that touches window". Are these hazards, does the plugin's audit flag them, and what would actually be a problem here? There is no repository available in this session: answer from this description.
