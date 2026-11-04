#!/usr/bin/env bash
# Creates a small, realistic Nuxt 4 app with PROPER module boundaries and NO architecture defect:
# - every cross-feature import goes through the feature's public index.ts (no internal bypass);
# - the shell (layout, middleware) depends only on the auth domain, which is a core/session layer;
# - shared/ui code depends on nothing domain-specific.
# domain-deps should report no confirmed architecture defect. No installs, no network.
set -euo pipefail
mkdir -p app/layouts app/middleware app/pages/orders app/pages/billing \
  app/features/orders app/features/billing/internal app/features/auth \
  app/components/ui app/composables

cat > package.json <<'EOF'
{ "name": "arch-clean-app", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF

cat > app/app.vue <<'EOF'
<template><NuxtLayout><NuxtPage /></NuxtLayout></template>
EOF

# --- shell: depends only on the auth (core) domain, through its public entry ---
cat > app/layouts/default.vue <<'EOF'
<script setup lang="ts">
import { useAuth } from '~/features/auth'
const { user } = useAuth()
</script>
<template><div><header>{{ user?.name }}</header><slot /></div></template>
EOF

cat > app/middleware/auth.ts <<'EOF'
import { useAuth } from '~/features/auth'
export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuth()
  if (!user.value) return navigateTo('/login')
})
EOF

# --- auth feature (core/session layer) ---
cat > app/features/auth/index.ts <<'EOF'
export { useAuth } from './useAuth'
EOF

cat > app/features/auth/useAuth.ts <<'EOF'
export function useAuth() {
  const user = useState<{ name: string } | null>('user', () => null)
  return { user }
}
EOF

# --- billing feature: public entry + private internals, used only through index.ts ---
cat > app/features/billing/index.ts <<'EOF'
export { useBilling } from './useBilling'
export type { Invoice } from './types'
EOF

cat > app/features/billing/useBilling.ts <<'EOF'
import { priceLines } from './internal/calc'
import type { Invoice } from './types'
export function useBilling() {
  return { quote: (lines: number[]): Invoice => ({ total: priceLines(lines), currency: 'EUR' }) }
}
EOF

cat > app/features/billing/types.ts <<'EOF'
export interface Invoice { total: number; currency: string }
EOF

cat > app/features/billing/internal/calc.ts <<'EOF'
const VAT = 0.21
export function priceLines(lines: number[]): number {
  const net = lines.reduce((a, b) => a + b, 0)
  return Math.round(net * (1 + VAT) * 100) / 100
}
EOF

# --- orders feature: imports billing through its PUBLIC entry (no internal bypass) ---
cat > app/features/orders/index.ts <<'EOF'
export { useOrders } from './useOrders'
EOF

cat > app/features/orders/useOrders.ts <<'EOF'
import { useBilling } from '~/features/billing'
export function useOrders() {
  const { quote } = useBilling()
  return { totalFor: (lines: number[]) => quote(lines).total }
}
EOF

# --- pages wire features through their public entries ---
cat > app/pages/orders/index.vue <<'EOF'
<script setup lang="ts">
import { useOrders } from '~/features/orders'
const { totalFor } = useOrders()
const total = totalFor([10, 20])
</script>
<template><p>{{ total }}</p></template>
EOF

cat > app/pages/billing/index.vue <<'EOF'
<script setup lang="ts">
import { useBilling } from '~/features/billing'
const { quote } = useBilling()
const invoice = quote([10, 20])
</script>
<template><p>{{ invoice.total }} {{ invoice.currency }}</p></template>
EOF

# --- shared ui: depends on nothing domain-specific ---
cat > app/components/ui/BaseButton.vue <<'EOF'
<script setup lang="ts">
defineProps<{ label: string }>()
</script>
<template><button>{{ label }}</button></template>
EOF

cat > app/composables/useFormatMoney.ts <<'EOF'
export function useFormatMoney() {
  return { format: (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n) }
}
EOF

echo "scaffolded arch-clean-app"
