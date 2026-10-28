#!/usr/bin/env bash
# Creates a small Nuxt 4 app with known defects for the audit eval. No installs, no network.
set -euo pipefail
mkdir -p app/layouts app/middleware app/pages/crm app/pages/planos app/components/crm app/components/ui app/composables app/stores app/features/orders app/types
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
const { veModulo } = useSettingComercial()
const auth = useAuthStore()
</script>
<template><div><CrmBadge v-if="veModulo('crm')" estado="x" /><slot /></div></template>
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
const { listOportunidades } = useCrm()
const { data } = await useAsyncData('home', () => listOportunidades())
</script>
<template><p>{{ data?.length }}</p></template>
EOF
cat > app/pages/crm/index.vue <<'EOF'
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const open = ref(false)
</script>
<template><CrmOportunidadModal v-model:open="open" /></template>
EOF
cat > app/pages/planos/index.vue <<'EOF'
<script setup lang="ts">
const { listPlanos } = usePlanos()
</script>
<template><ul><li v-for="p in []" :key="p">{{ p }}</li></ul></template>
EOF
cat > app/components/crm/CrmBadge.vue <<'EOF'
<script setup lang="ts">
defineProps<{ estado: string }>()
</script>
<template><span>{{ estado }}</span></template>
EOF
cat > app/components/crm/CrmOportunidadModal.vue <<'EOF'
<script setup lang="ts">
const open = defineModel<boolean>('open')
const { listOportunidades } = useCrm()
onMounted(() => {
  window.addEventListener('keydown', () => { open.value = false })
  setInterval(() => listOportunidades(), 5000)
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
cat > app/composables/useCrm.ts <<'EOF'
import type { Oportunidad } from '~/types/crm'
export function useCrm() {
  const { apiFetch } = useApi()
  return { listOportunidades: () => apiFetch<Oportunidad[]>('/crm/oportunidades') }
}
EOF
cat > app/composables/useSettingComercial.ts <<'EOF'
export function useSettingComercial() {
  const permisos = useState<string[]>('comercial-permisos', () => [])
  return { veModulo: (m: string) => permisos.value.includes(m) }
}
EOF
cat > app/composables/usePlanos.ts <<'EOF'
export function usePlanos() { const { apiFetch } = useApi(); return { listPlanos: () => apiFetch<string[]>('/obra/planos') } }
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
cat > app/types/crm.ts <<'EOF'
export interface Oportunidad { id: string; nombre: string }
EOF
echo "scaffolded eval-nuxt-app"
