#!/usr/bin/env bash
# B-01 (set B, blind). AppInput wraps UInput as its single root but declares a defineModel — per the contract a
# pass-through has no props, no emits, no models and no behaviour, so a model alone disqualifies it (trap).
# AppBadge is the control: a genuine pass-through next to it, so the case discriminates instead of just abstaining.
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-holdout-b01", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --color-brand-500: #0f766e; --space-3: 0.75rem; --radius-sm: 0.25rem; --font-size-sm: 0.875rem; }
EOF

cat > app/components/ui/AppInput.vue <<'EOF'
<!-- AppInput — text input bound with v-model; the design-system entry point for UInput. -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const model = defineModel<string>()
</script>
<template>
  <UInput v-model="model" v-bind="$attrs" />
</template>
EOF

cat > app/components/ui/AppBadge.vue <<'EOF'
<!-- AppBadge — badge "for consistency". -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>
<template>
  <UBadge v-bind="$attrs"><slot /></UBadge>
</template>
EOF

cat > app/components/ui/index.ts <<'EOF'
export { default as AppInput } from './AppInput.vue'
export { default as AppBadge } from './AppBadge.vue'
EOF
