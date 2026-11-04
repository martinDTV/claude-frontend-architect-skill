#!/usr/bin/env bash
# Nuxt 4 app that LOOKS like it might break a boundary but does not:
#  - features/invoices/index.ts is a BARREL that re-exports from its own private files
#    (export { x } from './internal/...'); re-exporting your OWN internals through your OWN
#    public entry is correct, not a cross-module leak.
#  - features/reports imports invoices ONLY through invoices' public index.ts.
# A naive matcher that flags "import reaches a file named internal/" or "re-export from a
# subpath" would wrongly report feature-internal-import or shared-imports-domain here.
set -euo pipefail
mkdir -p app/features/invoices/internal app/features/reports app/pages/reports

cat > package.json <<'EOF'
{ "name": "arch-barrel-ok-app", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

# invoices: its index re-exports from its OWN internals (legitimate barrel)
cat > app/features/invoices/index.ts <<'EOF'
export { formatInvoice } from './internal/format'
export { loadInvoices } from './internal/load'
export type { Invoice } from './internal/types'
EOF
cat > app/features/invoices/internal/format.ts <<'EOF'
import type { Invoice } from './types'
export function formatInvoice(i: Invoice): string { return `#${i.id}` }
EOF
cat > app/features/invoices/internal/load.ts <<'EOF'
import type { Invoice } from './types'
export function loadInvoices(): Invoice[] { return [] }
EOF
cat > app/features/invoices/internal/types.ts <<'EOF'
export interface Invoice { id: string }
EOF

# reports imports invoices ONLY through its public index.ts: correct
cat > app/features/reports/index.ts <<'EOF'
export { useReports } from './useReports'
EOF
cat > app/features/reports/useReports.ts <<'EOF'
import { loadInvoices, formatInvoice } from '~/features/invoices'
export function useReports() {
  return { lines: () => loadInvoices().map(formatInvoice) }
}
EOF

cat > app/pages/reports/index.vue <<'EOF'
<script setup lang="ts">
import { useReports } from '~/features/reports'
const { lines } = useReports()
</script>
<template><ul><li v-for="l in lines()" :key="l">{{ l }}</li></ul></template>
EOF
echo "scaffolded arch-barrel-ok-app"
