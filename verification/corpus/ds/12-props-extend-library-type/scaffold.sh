#!/usr/bin/env bash
# Audit I1: props typed as `interface Props extends ButtonProps` and `type Props = InputProps & {...}` — the inline
# list is PARTIAL. The honest result is props-partially-resolved (info), never a complete API. Both documented.
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

cat > app/components/ui/AppButton.vue <<'EOF'
<!-- AppButton — UButton with a mandatory label. -->
<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui"
interface Props extends ButtonProps { label: string }
withDefaults(defineProps<Props>(), { label: "Save" })
</script>
<template><UButton v-bind="$props">{{ label }}</UButton></template>
EOF
cat > app/components/ui/AppInput.vue <<'EOF'
<!-- AppInput — UInput with a hint. -->
<script setup lang="ts">
import type { InputProps } from "@nuxt/ui"
type Props = InputProps & { hint?: string }
defineProps<Props>()
</script>
<template><div><UInput v-bind="$props" /><small v-if="hint">{{ hint }}</small></div></template>
EOF
printf "export { default as AppButton } from './AppButton.vue'
export { default as AppInput } from './AppInput.vue'
" > app/components/ui/index.ts
