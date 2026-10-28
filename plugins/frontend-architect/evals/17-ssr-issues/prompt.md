---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Find SSR problems in a module-level Axios plugin and a component reading Date.now and localStorage"
expected_outcome: "Cross-request leak named and fixed per request, absolute server baseURL, hydration hazards fixed"
tags: ["activation:architect", "domain:vue-nuxt", "domain:security", "domain:audit"]
---
Find the SSR problems: // plugins/api.ts in Nuxt
const api = axios.create({ baseURL: '/api' })
export function setToken(t: string) { api.defaults.headers.common.Authorization = `Bearer ${t}` }
export default defineNuxtPlugin(() => ({ provide: { api } }))
// component: const now = Date.now(); const theme = localStorage.getItem('theme')
