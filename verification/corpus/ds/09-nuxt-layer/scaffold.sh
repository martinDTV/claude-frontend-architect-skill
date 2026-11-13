#!/usr/bin/env bash
# A design-system root inside a Nuxt layer the app extends. BrandMark is private (the app barrel does not export it)
# and undocumented: not a defect. BrandCard in the layer is a pass-through around UCard: a defect, found only if the
# layer root is inventoried.
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

mkdir -p layers/brand/components/ui
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', extends: ['./layers/brand'], modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
echo "export default defineNuxtConfig({})" > layers/brand/nuxt.config.ts
cat > layers/brand/components/ui/BrandMark.vue <<'EOF'
<script setup lang="ts">
defineProps<{ size?: "sm" | "md" }>()
</script>
<template><span class="text-[var(--color-brand-500)] font-semibold">Atlas</span></template>
EOF
cat > layers/brand/components/ui/BrandCard.vue <<'EOF'
<!-- BrandCard — a card. -->
<template><UCard v-bind="$attrs"><slot /></UCard></template>
EOF
cat > app/components/ui/AppTitle.vue <<'EOF'
<!-- AppTitle — page title. -->
<script setup lang="ts">
defineProps<{ text: string }>()
</script>
<template><h1 class="text-[var(--color-brand-500)]">{{ text }}</h1></template>
EOF
echo "export { default as AppTitle } from './AppTitle.vue'" > app/components/ui/index.ts
