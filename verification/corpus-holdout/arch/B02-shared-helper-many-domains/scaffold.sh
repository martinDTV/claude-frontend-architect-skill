#!/usr/bin/env bash
# Nuxt 4 app. GENERALIZATION trap for the cross-domain-hotspot / shared-imports-domain rules.
# Four business domains (pricing, billing, shipping, tax) each import one genuinely shared,
# domain-free helper: shared/money/format.ts (a pure currency formatter). A naive "used by many
# domains => hotspot" heuristic would flag it, but the file lives in shared/ (classified shared,
# not a business domain) and imports NOTHING from any domain, so neither cross-domain-hotspot
# (skipped for shared-kind files) nor shared-imports-domain (shared importing a domain) is a real
# defect. A human reads this as: a correctly placed shared utility, exactly where it belongs.
# This is DIFFERENT from the dev corpus negative control (a Next.js app checking shell/shared
# import directions) and uses a different framework, layout and identifier set.
set -euo pipefail
mkdir -p app/shared/money app/features/pricing app/features/billing app/features/shipping app/features/tax

cat > package.json <<'EOF'
{ "name": "holdout-shared-helper", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > .frontend-audit.json <<'EOF'
{
  "domains": {
    "pricing": ["app/features/pricing/**"],
    "billing": ["app/features/billing/**"],
    "shipping": ["app/features/shipping/**"],
    "tax": ["app/features/tax/**"]
  },
  "shared": ["app/shared/**"]
}
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

# genuinely shared, domain-free helper
cat > app/shared/money/format.ts <<'EOF'
export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}
EOF

# four domains all import the shared helper (and nothing cross-domain)
for d in pricing billing shipping tax; do
cat > app/features/$d/use${d}.ts <<EOF
import { formatMoney } from '~/shared/money/format'
export function use_${d}_label(cents: number) { return formatMoney(cents) }
EOF
done
echo "scaffolded holdout-shared-helper"
