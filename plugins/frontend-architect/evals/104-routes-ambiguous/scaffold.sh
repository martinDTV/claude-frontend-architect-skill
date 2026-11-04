#!/usr/bin/env bash
# Creates a small Nuxt 4 app where a page is correctly guarded AND contains a literal role comparison
# used for UX. No installs, no network.
# The ambiguous case (NOT a clear bug): app/pages/admin/index.vue is guarded by the `auth` middleware
# (so the route is not unguarded), but its script does `user.role === 'admin'` to decide whether to show
# an admin-only button. routes-audit reports this as hardcoded-role-check (heuristic). The honest reading
# is that this is legitimate as UX — hiding a control the user cannot use — but it is NOT the security
# boundary: the server must still enforce the permission on every mutating request. The finding must be
# presented as "verify the server enforces this", never as "the app is insecure" nor dismissed as noise.
set -euo pipefail
mkdir -p app/middleware app/pages/admin app/stores server/api
cat > package.json <<'EOF'
{ "name": "eval-routes-ambiguous", "private": true, "dependencies": { "nuxt": "^4.6.0", "@pinia/nuxt": "^1.0.0", "pinia": "^4.1.0" } }
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
# The ambiguous page: properly guarded, but a literal role check drives a UI affordance.
cat > app/pages/admin/index.vue <<'EOF'
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const auth = useAuthStore()
// UX only: hide the destructive control for non-admins. The server still enforces the real check.
const canManage = auth.user?.role === 'admin'
</script>
<template>
  <section>
    <p>Admin dashboard</p>
    <button v-if="canManage">Delete tenant</button>
  </section>
</template>
EOF
cat > app/stores/auth.ts <<'EOF'
import { defineStore } from 'pinia'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: string; role: string } | null>(null)
  return { user }
})
EOF
# The server endpoint that actually enforces authorization (so the UI check is genuinely just UX).
cat > server/api/tenant.delete.ts <<'EOF'
export default defineEventHandler((event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') throw createError({ statusCode: 403 })
  return { ok: true }
})
EOF
echo "scaffolded eval-routes-ambiguous"
