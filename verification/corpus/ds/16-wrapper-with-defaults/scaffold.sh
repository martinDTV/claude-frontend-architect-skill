#!/usr/bin/env bash
# Audit I5 + M3: a wrapper whose only content is static attributes on the library root sets project DEFAULTS — the
# reference names that as a legitimate wrapper; it is NOT a pass-through. A kebab-case library root (<u-link>) with
# nothing of its own IS a pass-through (legal Vue spelling, same library component).
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

cat > app/components/ui/AppBadge.vue <<'EOF'
<!-- AppBadge — UBadge, always subtle and neutral. -->
<template><UBadge color="neutral" variant="subtle"><slot /></UBadge></template>
EOF
cat > app/components/ui/AppLink.vue <<'EOF'
<!-- AppLink — a link. -->
<template><u-link v-bind="$attrs"><slot /></u-link></template>
EOF
printf "export { default as AppBadge } from './AppBadge.vue'
export { default as AppLink } from './AppLink.vue'
" > app/components/ui/index.ts
