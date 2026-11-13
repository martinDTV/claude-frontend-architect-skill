#!/usr/bin/env bash
# Audit I2: a barrel written with every form — `import X … export { X }`, `export * from ./sub` into a sub-barrel,
# `export type`. Every re-exported component is public; the two undocumented ones are defects, the documented one is not.
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

mkdir -p app/components/ui/forms
cat > app/components/ui/AppTag.vue <<'EOF'
<script setup lang="ts">
defineProps<{ label: string }>()
</script>
<template><span>{{ label }}</span></template>
EOF
cat > app/components/ui/forms/AppCheckbox.vue <<'EOF'
<script setup lang="ts">
defineProps<{ label: string }>()
const model = defineModel<boolean>()
</script>
<template><label><input v-model="model" type="checkbox" /> {{ label }}</label></template>
EOF
cat > app/components/ui/AppTitle.vue <<'EOF'
<!-- AppTitle — page title. -->
<script setup lang="ts">
defineProps<{ text: string }>()
</script>
<template><h1>{{ text }}</h1></template>
EOF
printf "export { default as AppCheckbox } from './AppCheckbox.vue'
" > app/components/ui/forms/index.ts
printf "import AppTag from './AppTag.vue'
export { AppTag }
export * from './forms'
export { default as AppTitle } from './AppTitle.vue'
export type { TagProps } from './types'
" > app/components/ui/index.ts
