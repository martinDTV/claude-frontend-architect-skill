#!/usr/bin/env bash
# Nuxt 4 app with a DEPENDENCY POLICY (a surface the development arch corpus never exercises).
# The policy allows catalog -> inventory, but NOT orders -> inventory.
# orders/useOrders.ts has exactly ONE cross-domain reference to inventory:
#   `import type { StockLevel } from '~/features/inventory/types'`  -- TYPE-ONLY.
# A human reads this as genuinely ambiguous: at runtime nothing couples orders to inventory
# (the import erases at build time), yet orders is reading inventory's internal type contract,
# which the policy forbids as a pair. The rule treats a type-only forbidden pair as a real
# finding (forbidden-dependency) but at LOW severity, because it is design-time coupling only.
# This differs from the dev corpus type-only arch case (a Next.js shared/ file splitting a
# runtime + type import) in framework, layout, carrier (policy vs barrel) and identifiers.
set -euo pipefail
mkdir -p app/features/orders app/features/inventory app/features/catalog

cat > package.json <<'EOF'
{ "name": "holdout-type-forbidden", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > .frontend-audit.json <<'EOF'
{
  "domains": {
    "orders": ["app/features/orders/**"],
    "inventory": ["app/features/inventory/**"],
    "catalog": ["app/features/catalog/**"]
  },
  "dependencies": {
    "allowed": [["catalog", "inventory"]]
  }
}
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/features/inventory/types.ts <<'EOF'
export interface StockLevel { sku: string; onHand: number }
EOF
cat > app/features/inventory/index.ts <<'EOF'
export type { StockLevel } from './types'
EOF

# DEFECT (ambiguous): orders depends on inventory, a forbidden pair, but TYPE-ONLY
cat > app/features/orders/useOrders.ts <<'EOF'
import type { StockLevel } from '~/features/inventory/types'
export function annotate(line: { sku: string }, stock: StockLevel) {
  return { ...line, available: stock.onHand > 0 }
}
EOF

# allowed pair, for contrast: catalog -> inventory (runtime), which the policy permits
cat > app/features/catalog/useCatalog.ts <<'EOF'
import { StockLevel } from '~/features/inventory/types'
export function hasStock(s: StockLevel) { return s.onHand > 0 }
EOF
echo "scaffolded holdout-type-forbidden"
