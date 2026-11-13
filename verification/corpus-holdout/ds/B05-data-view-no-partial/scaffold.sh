#!/usr/bin/env bash
# B-05 (set B, blind). OrdersTable.vue is a data view (useAsyncData, no generic) that renders loading via
# `status === 'pending'`, error via `error`, empty via `!data?.length` and success via the table — but has no
# partial state (no pagination / load-more / stale-while-revalidate branch). Expected: data-view-missing-states at
# heuristic with only `partial` missing. PriceTag.vue is the control: no async, no status/pending prop — not a
# data view at all, so the finding must not appear there.
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-holdout-b05", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --color-muted: #6b7280; --space-2: 0.5rem; --space-6: 1.5rem; --font-size-lg: 1.125rem; }
EOF

cat > app/components/ui/OrdersTable.vue <<'EOF'
<!-- OrdersTable — the customer's orders, fetched on mount. -->
<script setup lang="ts">
const props = defineProps<{ customerId: string }>()
const { data, status, error, refresh } = useAsyncData(
  () => `orders-${props.customerId}`,
  () => $fetch('/api/orders', { query: { customerId: props.customerId } }),
)
const columns = [
  { accessorKey: 'id', header: 'Order' },
  { accessorKey: 'total', header: 'Total' },
]
</script>
<template>
  <div class="orders-table">
    <USkeleton v-if="status === 'pending'" class="h-32 w-full" />
    <UAlert v-else-if="error" color="error" title="Could not load orders">
      <template #actions><UButton variant="ghost" @click="refresh()">Retry</UButton></template>
    </UAlert>
    <p v-else-if="!data?.length" class="orders-table__empty">No orders yet.</p>
    <UTable v-else :data="data" :columns="columns" />
  </div>
</template>
<style scoped>
.orders-table__empty { color: var(--color-muted); padding: var(--space-6); }
</style>
EOF

cat > app/components/ui/PriceTag.vue <<'EOF'
<!-- PriceTag — formats an amount with its currency; purely presentational. -->
<script setup lang="ts">
const props = defineProps<{ amount: number; currency?: string }>()
const formatted = computed(() =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: props.currency ?? 'EUR' }).format(props.amount),
)
</script>
<template>
  <span class="price-tag">{{ formatted }}</span>
</template>
<style scoped>
.price-tag { font-size: var(--font-size-lg); }
</style>
EOF

cat > app/components/ui/index.ts <<'EOF'
export { default as OrdersTable } from './OrdersTable.vue'
export { default as PriceTag } from './PriceTag.vue'
EOF
