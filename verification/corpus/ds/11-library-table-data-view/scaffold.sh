#!/usr/bin/env bash
# A data view that renders its rows through the library's table (<UTable :data>) with no v-for anywhere, found as a
# blind hold-out miss (ds/B05). Loading, error and empty are rendered; partial is not → heuristic lead.
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-case", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --space-6: 1.5rem; --color-muted: #6b7280; }
EOF
cat > app/components/ui/InvoiceTable.vue <<'EOF'
<!-- InvoiceTable — invoices of one account, through UTable. -->
<script setup lang="ts">
const props = defineProps<{ accountId: string }>()
const { data, status, error, refresh } = useAsyncData(() => `invoices-${props.accountId}`, () => $fetch('/api/invoices', { query: { accountId: props.accountId } }))
const columns = [{ accessorKey: 'number', header: 'Invoice' }, { accessorKey: 'total', header: 'Total' }]
</script>
<template>
  <div>
    <USkeleton v-if="status === 'pending'" class="h-32" />
    <UAlert v-else-if="error" color="error" title="Could not load invoices"><template #actions><UButton @click="refresh()">Retry</UButton></template></UAlert>
    <p v-else-if="!data?.length" :style="{ padding: 'var(--space-6)' }">No invoices.</p>
    <UTable v-else :data="data" :columns="columns" />
  </div>
</template>
EOF
echo "export { default as InvoiceTable } from './InvoiceTable.vue'" > app/components/ui/index.ts
