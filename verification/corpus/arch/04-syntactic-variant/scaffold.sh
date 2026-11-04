#!/usr/bin/env bash
# Same defect class as 01 (a module reaching into another module's PRIVATE internals), written in
# two SYNTACTIC VARIANTS to test whether the auditor catches the equivalent forms:
#
#  Variant A (aliased import): fulfillment/useFulfillment.ts imports billing's private calc with an
#     `as` alias:  import { priceLines as calc } from '~/features/billing/internal/calc'.
#     The specifier still points straight at the private file, so this IS a feature-internal-import.
#
#  Variant B (re-export laundering): fulfillment/index.ts RE-EXPORTS billing's private symbol:
#     export { priceLines } from '~/features/billing/internal/calc'.
#     That re-export line is itself a cross-module edge into billing's internals (on index.ts).
#     A consumer then imports it from ~/features/fulfillment (the public entry). The leak is real;
#     the question is on which file a correct auditor pins it.
set -euo pipefail
mkdir -p app/features/billing/internal app/features/fulfillment app/pages/ops

cat > package.json <<'EOF'
{ "name": "arch-variant-app", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

# billing with public entry and private internals
cat > app/features/billing/index.ts <<'EOF'
export { useBilling } from './useBilling'
EOF
cat > app/features/billing/useBilling.ts <<'EOF'
import { priceLines } from './internal/calc'
export function useBilling() { return { quote: (l: number[]) => priceLines(l) } }
EOF
cat > app/features/billing/internal/calc.ts <<'EOF'
export function priceLines(l: number[]): number { return l.reduce((a, b) => a + b, 0) }
EOF

# fulfillment: index.ts launders billing's private symbol (Variant B)
cat > app/features/fulfillment/index.ts <<'EOF'
export { useFulfillment } from './useFulfillment'
export { priceLines } from '~/features/billing/internal/calc'
EOF
# Variant A: aliased direct import of billing's private file
cat > app/features/fulfillment/useFulfillment.ts <<'EOF'
import { priceLines as calc } from '~/features/billing/internal/calc'
export function useFulfillment() { return { cost: (l: number[]) => calc(l) } }
EOF

# consumer imports the laundered symbol via fulfillment's public entry
cat > app/pages/ops/index.vue <<'EOF'
<script setup lang="ts">
import { useFulfillment, priceLines } from '~/features/fulfillment'
const { cost } = useFulfillment()
const t = priceLines([1, 2])
</script>
<template><p>{{ cost([]) }} {{ t }}</p></template>
EOF
echo "scaffolded arch-variant-app"
