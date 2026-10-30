#!/usr/bin/env bash
# Creates a small Nuxt 4 app with known defects for the audit eval. No installs, no network.
set -euo pipefail
mkdir -p app/layouts app/middleware app/pages/sales app/pages/documents app/components/sales app/components/ui app/composables app/stores app/features/orders app/types
cat > package.json <<'EOF'
{ "name": "eval-nuxt-app", "private": true, "dependencies": { "nuxt": "^4.6.0", "@pinia/nuxt": "^1.0.0", "pinia": "^4.1.0", "axios": "^1.21.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ modules: ['@pinia/nuxt'], compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtLayout><NuxtPage /></NuxtLayout></template>
EOF
cat > app/layouts/default.vue <<'EOF'
<script setup lang="ts">
const { canSee } = useFeatureFlags()
const auth = useAuthStore()
</script>
<template><div><SalesBadge v-if="canSee('sales')" status="x" /><slot /></div></template>
EOF
cat > app/middleware/auth.ts <<'EOF'
export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore()
  if (!auth.user) return navigateTo('/login')
  if (auth.user.role === 'admin') return
})
EOF
cat > app/pages/index.vue <<'EOF'
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { listLeads } = useSales()
const { data } = await useAsyncData('home', () => listLeads())
</script>
<template><p>{{ data?.length }}</p></template>
EOF
cat > app/pages/sales/index.vue <<'EOF'
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const open = ref(false)
</script>
<template><SalesLeadModal v-model:open="open" /></template>
EOF
cat > app/pages/documents/index.vue <<'EOF'
<script setup lang="ts">
const { listDocuments } = useDocuments()
</script>
<template><ul><li v-for="p in []" :key="p">{{ p }}</li></ul></template>
EOF
cat > app/components/sales/SalesBadge.vue <<'EOF'
<script setup lang="ts">
defineProps<{ status: string }>()
</script>
<template><span>{{ status }}</span></template>
EOF
cat > app/components/sales/SalesLeadModal.vue <<'EOF'
<script setup lang="ts">
const open = defineModel<boolean>('open')
const { listLeads } = useSales()
onMounted(() => {
  window.addEventListener('keydown', () => { open.value = false })
  setInterval(() => listLeads(), 5000)
})
</script>
<template><div v-if="open"><slot /></div></template>
EOF
cat > app/components/ui/Leaky.vue <<'EOF'
<script setup lang="ts">
import { computeTotal } from '~/features/orders/internal'
const t = computeTotal([1])
</script>
<template><span>{{ t }}</span></template>
EOF
cat > app/composables/useApi.ts <<'EOF'
import axios from 'axios'
const api = axios.create({ baseURL: '/api/v1' })
export function setToken(token: string) { api.defaults.headers.common.Authorization = `Bearer ${token}` }
export function useApi() { return { api, apiFetch: <T>(url: string) => api.get<T>(url).then((r) => r.data) } }
EOF
cat > app/composables/useSales.ts <<'EOF'
import type { Lead } from '~/types/sales'
export function useSales() {
  const { apiFetch } = useApi()
  return { listLeads: () => apiFetch<Lead[]>('/sales/leads') }
}
EOF
cat > app/composables/useFeatureFlags.ts <<'EOF'
export function useFeatureFlags() {
  const permissions = useState<string[]>('flags-permissions', () => [])
  return { canSee: (m: string) => permissions.value.includes(m) }
}
EOF
cat > app/composables/useDocuments.ts <<'EOF'
export function useDocuments() { const { apiFetch } = useApi(); return { listDocuments: () => apiFetch<string[]>('/projects/documents') } }
EOF
cat > app/stores/auth.ts <<'EOF'
import { defineStore } from 'pinia'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: string; role: string } | null>(null)
  async function login(email: string, password: string) {
    const { api } = useApi()
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('access', data.access)
    localStorage.setItem('refresh', data.refresh)
    setToken(data.access)
  }
  function logout() { localStorage.removeItem('access') }
  return { user, login, logout }
}, { persist: true })
EOF
cat > app/features/orders/index.ts <<'EOF'
export { useOrders } from './useOrders'
EOF
cat > app/features/orders/useOrders.ts <<'EOF'
import { computeTotal } from './internal'
export function useOrders() { return { total: (l: number[]) => computeTotal(l) } }
EOF
cat > app/features/orders/internal.ts <<'EOF'
export function computeTotal(lines: number[]) { return lines.reduce((a, b) => a + b, 0) }
EOF
cat > app/types/sales.ts <<'EOF'
export interface Lead { id: string; name: string }
EOF
echo "scaffolded eval-nuxt-app"
