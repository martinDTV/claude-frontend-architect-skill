#!/usr/bin/env bash
# Nuxt 4 app whose single cross-module import is TYPE-ONLY. The "shipping" module imports a TYPE
# from an INTERNAL file of the "orders" module. Whether this is a real defect is context-dependent:
#  - it is compile-time coupling only (erased at build, no runtime cycle, no bundled code),
#  - but it still ties shipping's source to an orders INTERNAL type that orders may change.
# A human marks this ambiguous: a correct auditor should still surface it, but at LOW/MEDIUM
# severity (type-only), never as a high-severity runtime boundary break.
set -euo pipefail
mkdir -p app/features/orders/internal app/features/shipping app/pages/ship

cat > package.json <<'EOF'
{ "name": "arch-type-only-app", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/features/orders/index.ts <<'EOF'
export { useOrders } from './useOrders'
EOF
cat > app/features/orders/useOrders.ts <<'EOF'
import type { OrderLine } from './internal/model'
export function useOrders() { return { lines: [] as OrderLine[] } }
EOF
cat > app/features/orders/internal/model.ts <<'EOF'
export interface OrderLine { sku: string; qty: number }
EOF

cat > app/features/shipping/index.ts <<'EOF'
export { useShipping } from './useShipping'
EOF
# THE AMBIGUOUS EDGE: a TYPE-ONLY import of an orders INTERNAL type
cat > app/features/shipping/useShipping.ts <<'EOF'
import type { OrderLine } from '~/features/orders/internal/model'
export function useShipping() {
  return { weight: (lines: OrderLine[]) => lines.length }
}
EOF

cat > app/pages/ship/index.vue <<'EOF'
<script setup lang="ts">
import { useShipping } from '~/features/shipping'
const { weight } = useShipping()
</script>
<template><p>{{ weight([]) }}</p></template>
EOF
echo "scaffolded arch-type-only-app"
