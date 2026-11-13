#!/usr/bin/env bash
# Props spread from an imported object the inventory does not follow in v1. The honest answer is an info-level
# "partially resolved", never a confirmed or heuristic finding invented from the unresolved list; the component is
# documented and public, so a clean (no defect-level finding) result is the correct one.
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

cat > app/components/ui/field.props.ts <<'EOF'
export const fieldProps = { label: { type: String, required: true }, hint: String } as const
EOF
cat > app/components/ui/AppField.vue <<'EOF'
<!-- AppField — label + hint around any control. -->
<script setup lang="ts">
import { fieldProps } from "./field.props"
defineProps({ ...fieldProps, required: Boolean })
</script>
<template><div class="flex flex-col gap-[var(--space-2)]"><label>{{ label }}</label><slot /><small v-if="hint">{{ hint }}</small></div></template>
EOF
echo "export { default as AppField } from './AppField.vue'" > app/components/ui/index.ts
