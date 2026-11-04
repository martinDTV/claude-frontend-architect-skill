#!/usr/bin/env bash
# Creates a small, realistic Nuxt 4 app with ONE genuine architecture defect: the "orders" feature
# reaches directly into the PRIVATE internals of the "billing" feature (features/billing/internal/calc),
# bypassing billing's public entry (features/billing/index.ts). A human reviewer recognises this as a
# broken module boundary: billing's internal pricing logic is now coupled to orders and cannot change
# without risking orders. No installs, no network.
set -euo pipefail
mkdir -p app/layouts app/pages/orders app/pages/billing \
  app/features/orders app/features/billing/internal app/composables app/types

cat > package.json <<'EOF'
{ "name": "arch-positive-app", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF

cat > app/app.vue <<'EOF'
<template><NuxtLayout><NuxtPage /></NuxtLayout></template>
EOF

cat > app/layouts/default.vue <<'EOF'
<template><div><slot /></div></template>
EOF

# --- billing feature: has a public entry (index.ts) and private internals ---
cat > app/features/billing/index.ts <<'EOF'
// Public API of the billing feature. Everything outside billing must import from here.
export { useBilling } from './useBilling'
export type { Invoice } from './types'
EOF

cat > app/features/billing/useBilling.ts <<'EOF'
import { priceLines } from './internal/calc'
import type { Invoice } from './types'
export function useBilling() {
  return {
    quote: (lines: number[]): Invoice => ({ total: priceLines(lines), currency: 'EUR' }),
  }
}
EOF

cat > app/features/billing/types.ts <<'EOF'
export interface Invoice { total: number; currency: string }
EOF

cat > app/features/billing/internal/calc.ts <<'EOF'
// PRIVATE: billing's pricing rules. Taxes and rounding live here and are expected to change.
const VAT = 0.21
export function priceLines(lines: number[]): number {
  const net = lines.reduce((a, b) => a + b, 0)
  return Math.round(net * (1 + VAT) * 100) / 100
}
EOF

# --- orders feature: has its own public entry ---
cat > app/features/orders/index.ts <<'EOF'
export { useOrders } from './useOrders'
EOF

# THE DEFECT: orders imports billing's PRIVATE internal file instead of its public index.ts
cat > app/features/orders/useOrders.ts <<'EOF'
import { priceLines } from '~/features/billing/internal/calc'
export function useOrders() {
  return {
    totalFor: (lines: number[]) => priceLines(lines),
  }
}
EOF

# --- pages wire the features through their public entries ---
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

cat > app/composables/useFormatMoney.ts <<'EOF'
export function useFormatMoney() {
  return { format: (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n) }
}
EOF

cat > app/types/index.ts <<'EOF'
export interface Money { amount: number; currency: string }
EOF

echo "scaffolded arch-positive-app"
