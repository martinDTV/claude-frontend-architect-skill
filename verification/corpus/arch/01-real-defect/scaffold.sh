#!/usr/bin/env bash
# Nuxt 4 app with a GENUINE runtime cycle between two business domains:
#   features/cart   imports features/catalog (to read a product's price), AND
#   features/catalog imports features/cart (to show "in cart" badges).
# Each import goes through the OTHER module's PRIVATE file, so there are also two
# feature-internal-import defects. A human reads this as: cart and catalog cannot be
# split, deployed or reasoned about independently; the dependency runs in both directions.
set -euo pipefail
mkdir -p app/features/cart app/features/catalog app/pages/shop

cat > package.json <<'EOF'
{ "name": "arch-cycle-app", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

# catalog module
cat > app/features/catalog/index.ts <<'EOF'
export { useCatalog } from './useCatalog'
export type { Product } from './types'
EOF
cat > app/features/catalog/types.ts <<'EOF'
export interface Product { id: string; price: number }
EOF
# DEFECT A: catalog reaches into cart's PRIVATE store (runtime), closing a cycle
cat > app/features/catalog/useCatalog.ts <<'EOF'
import { cartItems } from '~/features/cart/cartStore'
export function useCatalog() {
  return { inCart: (id: string) => cartItems().some((i) => i.id === id) }
}
EOF

# cart module
cat > app/features/cart/index.ts <<'EOF'
export { useCart } from './useCart'
EOF
cat > app/features/cart/cartStore.ts <<'EOF'
const items: { id: string }[] = []
export function cartItems() { return items }
EOF
# DEFECT B: cart reaches into catalog's PRIVATE pricing file (runtime), the other half of the cycle
cat > app/features/cart/useCart.ts <<'EOF'
import { priceOf } from '~/features/catalog/pricing'
export function useCart() {
  return { total: (ids: string[]) => ids.reduce((a, id) => a + priceOf(id), 0) }
}
EOF
cat > app/features/catalog/pricing.ts <<'EOF'
export function priceOf(_id: string): number { return 9.99 }
EOF

cat > app/pages/shop/index.vue <<'EOF'
<script setup lang="ts">
import { useCatalog } from '~/features/catalog'
import { useCart } from '~/features/cart'
const { inCart } = useCatalog()
const { total } = useCart()
</script>
<template><p>{{ inCart('x') }} {{ total([]) }}</p></template>
EOF
echo "scaffolded arch-cycle-app"
