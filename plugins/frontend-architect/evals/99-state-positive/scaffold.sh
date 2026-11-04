#!/usr/bin/env bash
# Creates a small Nuxt 4 app with a GENUINE state/SSR defect for the state-audit eval.
# No installs, no network. The defects are real cross-request/token-leak patterns, not regex bait:
#   - a module-level Axios instance whose Authorization header is mutated (shared by every SSR request)
#   - tokens written to localStorage (access + refresh)
#   - a logout that removes one token but clears no query cache or state
set -euo pipefail
mkdir -p app/composables app/stores app/pages
cat > package.json <<'EOF'
{ "name": "eval-state-positive", "private": true, "dependencies": { "nuxt": "^4.6.0", "@pinia/nuxt": "^1.0.0", "pinia": "^4.1.0", "axios": "^1.21.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
// SSR is on (the Nuxt default): the module-level client below is shared across every request.
export default defineNuxtConfig({ modules: ['@pinia/nuxt'], ssr: true, compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF
cat > app/composables/useApi.ts <<'EOF'
import axios from 'axios'
// One Axios instance created at module load: every SSR request on this server shares it.
const api = axios.create({ baseURL: '/api/v1' })
// Mutating the shared instance's auth header leaks one user's token into the next request.
export function setToken(token: string) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`
}
export function useApi() {
  return { api, apiFetch: <T>(url: string) => api.get<T>(url).then((r) => r.data) }
}
EOF
cat > app/stores/auth.ts <<'EOF'
import { defineStore } from 'pinia'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: string } | null>(null)
  async function login(email: string, password: string) {
    const { api } = useApi()
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('nexus:access', data.access)
    localStorage.setItem('nexus:refresh', data.refresh)
    setToken(data.access)
  }
  // Removes the access token but clears no query cache and no app state.
  function logout() {
    localStorage.removeItem('nexus:access')
  }
  return { user, login, logout }
})
EOF
cat > app/pages/index.vue <<'EOF'
<script setup lang="ts">
const auth = useAuthStore()
</script>
<template><p>{{ auth.user?.id ?? 'anon' }}</p></template>
EOF
echo "scaffolded eval-state-positive"
