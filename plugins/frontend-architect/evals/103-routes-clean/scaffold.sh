#!/usr/bin/env bash
# Creates a small Nuxt 4 app where every page is properly guarded. No installs, no network.
# No planted defect: every private page declares the `auth` middleware via definePageMeta, the login
# page is a generic public route, and no page names a middleware that does not exist. routes-audit must
# report zero confirmed findings and zero page-without-guard findings (the clean control).
set -euo pipefail
mkdir -p app/middleware app/pages/account app/pages/billing app/composables app/stores
cat > package.json <<'EOF'
{ "name": "eval-routes-clean", "private": true, "dependencies": { "nuxt": "^4.6.0", "@pinia/nuxt": "^1.0.0", "pinia": "^4.1.0" } }
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
cat > app/pages/login.vue <<'EOF'
<script setup lang="ts">
const email = ref('')
const password = ref('')
</script>
<template><form><input v-model="email" /><input v-model="password" type="password" /></form></template>
EOF
cat > app/pages/account/index.vue <<'EOF'
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const auth = useAuthStore()
</script>
<template><p>{{ auth.user?.id }}</p></template>
EOF
cat > app/pages/billing/invoices.vue <<'EOF'
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
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
echo "scaffolded eval-routes-clean"
