---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Find the SSR problems: // plugins/api.ts in Nuxt
const api = axios.create({ baseURL: '/api' })
export function setToken(t: string) { api.defaults.headers.common.Authorization = `Bearer ${t}` }
export default defineNuxtPlugin(() => ({ provide: { api } }))
// component: const now = Date.now(); const theme = localStorage.getItem('theme')
