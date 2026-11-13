#!/usr/bin/env bash
# Audit I4: markers that want to be @ds-ejected but are not well-formed (a 40-char hash; uppercase hex with indentation).
# They must be reported as malformed — never silently treated as project code with the marker counted as documentation.
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

cat > app/components/ui/AppShort.vue <<'EOF'
<!-- @ds-ejected from="shadcn-vue/short" version="0.1.0" sha256="abc123def456abc123def456abc123def456abcd" -->
<!-- AppShort — ejected. -->
<script setup lang="ts">
defineProps<{ a: string }>()
</script>
<template><span>{{ a }}</span></template>
EOF
printf "  <!-- @ds-ejected from=\"shadcn-vue/upper\" version=\"0.1.0\" sha256=\"%s\" -->
<!-- AppUpper — ejected. -->
<template><span>u</span></template>
" "$(printf A%.0s $(seq 1 64))" > app/components/ui/AppUpper.vue
printf "export { default as AppShort } from './AppShort.vue'
export { default as AppUpper } from './AppUpper.vue'
" > app/components/ui/index.ts
