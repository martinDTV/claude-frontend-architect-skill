#!/usr/bin/env bash
# Creates a small Nuxt 4 app whose billing page sits behind no guard. No installs, no network.
# Planted defect (real, not regex-bait): app/pages/billing/invoices.vue has no page middleware and the
# project declares no global auth middleware, so routes-audit reports page-without-guard for it. The
# /account page is correctly guarded by the `auth` middleware, which proves the tool is discriminating,
# not flagging every page.
set -euo pipefail
mkdir -p app/middleware app/pages/account app/pages/billing app/composables app/stores
cat > package.json <<'EOF'
{ "name": "eval-routes-positive", "private": true, "dependencies": { "nuxt": "^4.6.0", "@pinia/nuxt": "^1.0.0", "pinia": "^4.1.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ modules: ['@pinia/nuxt'], compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF
cat > app/middleware/auth.ts <<'EOF'
export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore()
  if (!auth.user) return navigateTo('/login')
})
EOF
cat > app/pages/index.vue <<'EOF'
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
</script>
<template><p>home</p></template>
EOF
cat > app/pages/account/index.vue <<'EOF'
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const auth = useAuthStore()
</script>
<template><p>{{ auth.user?.id }}</p></template>
EOF
# The defect: a billing page with real content and NO guard at all.
cat > app/pages/billing/invoices.vue <<'EOF'
<script setup lang="ts">
const { listInvoices } = useBilling()
const { data } = await useAsyncData('invoices', () => listInvoices())
</script>
<template><ul><li v-for="i in data" :key="i.id">{{ i.total }}</li></ul></template>
EOF
cat > app/composables/useBilling.ts <<'EOF'
interface Invoice { id: string; total: number }
export function useBilling() {
  return { listInvoices: () => $fetch<Invoice[]>('/api/billing/invoices') }
}
EOF
cat > app/stores/auth.ts <<'EOF'
import { defineStore } from 'pinia'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: string } | null>(null)
  return { user }
})
EOF
echo "scaffolded eval-routes-positive"
