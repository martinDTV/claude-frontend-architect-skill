#!/usr/bin/env bash
# Two data views. OrderList renders fetched rows with only a pending skeleton and the rows (no empty, error or partial
# state anywhere in the file) — a heuristic lead. OrderTable models its view as a discriminated union with all five
# states — nothing to report. Both documented and exported.
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-case", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0", "tailwind-variants": "^1.0.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --color-brand-500: #2563eb; --space-2: 0.5rem; --radius-md: 0.5rem; }
EOF

cat > app/components/ui/OrderList.vue <<'EOF'
<!-- OrderList — rows from the orders endpoint. -->
<script setup lang="ts">
const { data: rows, pending } = await useFetch<{ id: string; total: number }[]>("/api/orders")
</script>
<template>
  <USkeleton v-if="pending" class="h-16" />
  <ul v-else><li v-for="r in rows" :key="r.id">{{ r.total }}</li></ul>
</template>
EOF
cat > app/components/ui/OrderTable.vue <<'EOF'
<!-- OrderTable — a data region with every state. -->
<script setup lang="ts">
type Row = { id: string; total: number }
type View = { status: "loading" } | { status: "empty" } | { status: "error"; message: string } | { status: "partial"; rows: Row[]; failed: number } | { status: "success"; rows: Row[] }
defineProps<{ view: View }>()
</script>
<template>
  <div>
    <USkeleton v-if="view.status === 'loading'" />
    <p v-else-if="view.status === 'empty'">No orders.</p>
    <UAlert v-else-if="view.status === 'error'" color="error" :title="view.message" />
    <template v-else>
      <UAlert v-if="view.status === 'partial'" color="warning" :title="`${view.failed} rows failed`" />
      <table><tr v-for="r in view.rows" :key="r.id"><td>{{ r.total }}</td></tr></table>
    </template>
  </div>
</template>
EOF
printf "export { default as OrderList } from './OrderList.vue'
export { default as OrderTable } from './OrderTable.vue'
" > app/components/ui/index.ts
