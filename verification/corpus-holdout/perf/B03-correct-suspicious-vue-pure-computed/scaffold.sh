#!/usr/bin/env bash
# GENERALIZATION (set B). Vue 3 / Nuxt component that LOOKS risky but is correct — a precision trap with
# carriers the development corpus does not use:
#   TRAP A: a computed() getter that builds a LOCAL object and mutates its own fields before returning it
#           (`const row = {}; row.total = ...; return row`). This is a pure derivation with no I/O,
#           navigation, emit or DOM access, so computed-side-effect must NOT fire.
#   TRAP B: xlsx (a heavy spreadsheet library) is imported type-only (`import type { WorkBook }`) and
#           otherwise reached only through a dynamic `await import('xlsx')` inside an event handler, so no
#           static value import exists and heavy-static-import must NOT fire.
#   TRAP C: `watch(() => state.filter, ...)` watches a specific getter, not the whole reactive object, so
#           reactive-deep-watch must NOT fire.
# A correct auditor reports nothing here; any defect-level finding is a false positive.
set -euo pipefail
mkdir -p app/components

cat > package.json <<'EOF'
{ "name": "holdout-perf-vue-pure", "private": true, "dependencies": { "nuxt": "3.14.0", "vue": "3.5.12", "xlsx": "0.18.5" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ ssr: true })
EOF

cat > app/components/ExportTable.vue <<'EOF'
<script setup lang="ts">
import type { WorkBook } from 'xlsx'
import { computed, reactive, watch } from 'vue'

const state = reactive({ filter: 'all', rows: [{ qty: 2, price: 3 }, { qty: 1, price: 5 }] })

// TRAP A: a pure derivation that mutates a LOCAL object before returning it — no I/O, no effect.
const summary = computed(() => {
  const row: { count: number; total: number } = { count: 0, total: 0 }
  row.count = state.rows.length
  row.total = state.rows.reduce((s, r) => s + r.qty * r.price, 0)
  return row
})

// TRAP C: watch a specific getter, not the whole reactive object.
watch(() => state.filter, (f) => {
  console.log('filter changed to', f)
})

// TRAP B: xlsx reached only via a dynamic import inside an event handler.
async function exportXlsx() {
  const XLSX = await import('xlsx')
  const wb: WorkBook = XLSX.utils.book_new()
  return wb
}
</script>

<template>
  <section>
    <h2>Export ({{ summary.count }} rows, total {{ summary.total }})</h2>
    <button @click="exportXlsx">Export</button>
  </section>
</template>
EOF

echo "scaffolded holdout-perf-vue-pure"
