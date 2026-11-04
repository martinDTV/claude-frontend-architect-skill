#!/usr/bin/env bash
# GENERALIZATION (set B). Nuxt 3 (Vue) project, a DIFFERENT framework and carrier from the development
# corpus routes cases. Two distinct, independently-derivable defects:
#   DEFECT A (unknown-middleware, confirmed): pages/billing.vue names middleware: 'subscription-guard'
#             in definePageMeta, but middleware/ contains only 'auth.global.ts' and 'staff.ts'. No file,
#             no Nuxt layer and no addRouteMiddleware registers 'subscription-guard', and no auth module
#             is installed, so Nuxt will throw at runtime. (Named auth.global.ts is NOT auth-like by name
#             and its body does not read user/session, so it does not count as a global auth guard.)
#   DEFECT B (page-without-guard, heuristic): pages/reports.vue has no definePageMeta middleware, is not a
#             public/auth route, and there is no global auth middleware — an unguarded private-looking page.
# The project ships no auth module, so unknown-middleware is reported at 'confirmed'.
set -euo pipefail
mkdir -p pages middleware

cat > package.json <<'EOF'
{ "name": "holdout-routes-nuxt-billing", "private": true, "dependencies": { "nuxt": "3.14.0", "vue": "3.5.12" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ ssr: true, modules: [] })
EOF

# A global middleware that is NOT auth-like: its name is generic and its body only logs; it reads no
# user/session, so routes-audit does not treat it as a global auth guard.
cat > middleware/analytics.global.ts <<'EOF'
export default defineNuxtRouteMiddleware((to) => {
  console.log('navigated to', to.path)
})
EOF

# A real named middleware (so namedMiddleware is non-empty and the unknown one stands out).
cat > middleware/staff.ts <<'EOF'
export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuthState()
  if (!user.value?.isStaff) return navigateTo('/forbidden')
})
EOF

# DEFECT A: references a middleware name that does not exist anywhere.
cat > pages/billing.vue <<'EOF'
<script setup lang="ts">
definePageMeta({ middleware: 'subscription-guard' })
</script>

<template>
  <section>
    <h1>Billing</h1>
  </section>
</template>
EOF

# DEFECT B: no middleware, not a public route, no global auth guard.
cat > pages/reports.vue <<'EOF'
<script setup lang="ts">
const { data } = await useFetch('/api/reports')
</script>

<template>
  <section>
    <h1>Reports</h1>
    <pre>{{ data }}</pre>
  </section>
</template>
EOF

# A genuinely public page that must NOT be flagged (login matches the default public-route regex).
cat > pages/login.vue <<'EOF'
<script setup lang="ts"></script>

<template>
  <form>
    <h1>Sign in</h1>
  </form>
</template>
EOF

echo "scaffolded holdout-routes-nuxt-billing"
