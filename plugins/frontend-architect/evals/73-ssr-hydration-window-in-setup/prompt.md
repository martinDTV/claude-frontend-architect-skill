---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Nuxt 4 with SSR on: a composable reads window.innerWidth at module scope, a component reads localStorage at the top of script setup, a Math.random() key in setup; hydration warnings"
expected_outcome: "browser-api-in-setup confirmed at setup/module level with SSR on; fixes with onMounted, import.meta.client, .client.vue, useState/cookie initial value; nondeterministic-render for Math.random; server HTML vs hydrated DOM in browser mode; no ssr:false first, no 'use client', no try/catch"
tags: ["activation:architect", "domain:ssr", "domain:vue-nuxt", "domain:state"]
---

In our Nuxt 4 app (SSR on) we get hydration mismatch warnings on the dashboard. `composables/useViewport.ts` does `const width = ref(window.innerWidth)` at module scope (someone wrapped it in a try/catch after the server logged `window is not defined`), `components/ThemeToggle.vue` reads `localStorage.getItem('theme')` at the top of `<script setup>` to pick the initial theme, and a teammate added `const nonce = Math.random()` in a component's setup to key a list. Explain what the plugin's audit reports for each of these, how to fix them properly, and how to confirm the fix. There is no repository available in this session: answer from this description.
