#!/usr/bin/env bash
# Creates a small Nuxt 4 app that handles state CORRECTLY, so state-audit reports no confirmed defect.
# No installs, no network. This is the negative control:
#   - the HTTP client is created per request inside defineNuxtPlugin (not at module scope)
#   - no token is written to web storage (the session lives in an httpOnly cookie set by the server)
#   - logout clears app state (clearNuxtState) rather than leaving caches behind
set -euo pipefail
mkdir -p app/composables app/plugins app/stores app/pages
cat > package.json <<'EOF'
{ "name": "eval-state-clean", "private": true, "dependencies": { "nuxt": "^4.6.0", "@pinia/nuxt": "^1.0.0", "pinia": "^4.1.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ modules: ['@pinia/nuxt'], ssr: true, compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF
cat > app/plugins/api.ts <<'EOF'
// Created per request inside the plugin, not at module scope: no sharing across SSR requests.
export default defineNuxtPlugin(() => {
  const api = $fetch.create({ baseURL: '/api/v1', credentials: 'include' })
  return { provide: { api } }
})
EOF
cat > app/composables/useApi.ts <<'EOF'
// Pulls the per-request instance the plugin provided; defines nothing at module scope.
export function useApi() {
  const { $api } = useNuxtApp()
  return { apiFetch: <T>(url: string) => $api<T>(url) }
}
EOF
cat > app/stores/auth.ts <<'EOF'
import { defineStore } from 'pinia'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: string } | null>(null)
  // The server sets an httpOnly session cookie on login; no token ever touches web storage.
  async function login(email: string, password: string) {
    const { apiFetch } = useApi()
    user.value = await apiFetch<{ id: string }>('/auth/login')
  }
  function logout() {
    user.value = null
    clearNuxtState()
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
echo "scaffolded eval-state-clean"
