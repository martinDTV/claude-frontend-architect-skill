#!/usr/bin/env bash
# A wrapper "for consistency" around UButton: no props, no emits, no behaviour, forwards attrs and the default slot.
# The honest classification is pass-through-wrapper (confirmed): the file adds nothing the library does not give.
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-case", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0", "tailwind-variants": "^1.0.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --color-brand-500: #2563eb; --space-2: 0.5rem; --radius-md: 0.5rem; }
EOF

cat > app/components/ui/AppButton.vue <<'EOF'
<!-- AppButton — our button. -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>
<template>
  <UButton v-bind="$attrs"><slot /></UButton>
</template>
EOF
echo "export { default as AppButton } from './AppButton.vue'" > app/components/ui/index.ts
