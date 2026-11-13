#!/usr/bin/env bash
# Audit I3: the idiomatic Nuxt empty branch `v-else-if="!data?.length"`. Loading, error, empty and success are rendered;
# only partial is missing; a correct inventory names exactly that.
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-case", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --color-brand-500: #2563eb; --space-2: 0.5rem; --radius-md: 0.5rem; }
EOF

cat > app/components/ui/AppOrders.vue <<'EOF'
<!-- AppOrders — orders of the account. -->
<script setup lang="ts">
const { data, status, error } = useFetch<{ id: string }[]>("/api/orders")
</script>
<template>
  <div>
    <USkeleton v-if="status === 'pending'" class="h-24" />
    <UAlert v-else-if="error" color="error" title="Could not load orders" />
    <p v-else-if="!data?.length">No orders yet.</p>
    <ul v-else><li v-for="o in data" :key="o.id">{{ o.id }}</li></ul>
  </div>
</template>
EOF
echo "export { default as AppOrders } from './AppOrders.vue'" > app/components/ui/index.ts
