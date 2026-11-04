#!/usr/bin/env bash
# Nuxt 4 app whose boundary break travels through a NUXT AUTO-IMPORTED COMPONENT, and the project is
# shipped WITHOUT the generated .nuxt/ metadata. The default layout (shell) uses <SalesWidget/> in its
# template; SalesWidget lives in components/sales/, a business domain. Nuxt auto-imports it (no explicit
# import line). WITHOUT .nuxt/components.d.ts the auditor must RE-IMPLEMENT Nuxt's component naming to
# guess the edge, so it can only be HEURISTIC (confidence "inferred"). Run `nuxt prepare` and the same
# edge becomes verified/confirmed. The defect is real; the CONFIDENCE is limited by missing context.
set -euo pipefail
mkdir -p app/layouts app/components/sales app/pages

cat > package.json <<'EOF'
{ "name": "arch-auto-import-ctx-app", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtLayout><NuxtPage /></NuxtLayout></template>
EOF

# SalesWidget is a business-domain component (components/sales -> domain "sales")
cat > app/components/sales/SalesWidget.vue <<'EOF'
<script setup lang="ts">
const revenue = 1234
</script>
<template><aside>Sales: {{ revenue }}</aside></template>
EOF

# shell: the default layout uses the domain component via Nuxt auto-import (no import line)
cat > app/layouts/default.vue <<'EOF'
<template>
  <div>
    <SalesWidget />
    <slot />
  </div>
</template>
EOF

cat > app/pages/index.vue <<'EOF'
<template><p>home</p></template>
EOF
# NOTE: no .nuxt/ directory on purpose: metadata is absent, so auto-import edges are inferred only.
echo "scaffolded arch-auto-import-ctx-app"
