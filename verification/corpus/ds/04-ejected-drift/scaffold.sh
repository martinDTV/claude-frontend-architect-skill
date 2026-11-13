#!/usr/bin/env bash
# Two ejected copies with the @ds-ejected marker: AppBadge was not touched after ejecting (hash matches the body),
# AppChip was edited afterwards without refreshing the marker (stale hash). Only the second is a defect.
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

body_badge='<!-- AppBadge — ejected from shadcn-vue. -->
<script setup lang="ts">
defineProps<{ variant?: "default" | "outline" }>()
</script>
<template><span :class="variant === '"'"'outline'"'"' ? '"'"'border'"'"' : '"'"'bg-[var(--color-brand-500)] text-white'"'"'"><slot /></span></template>
'
printf "%s" "$body_badge" > /tmp/_badge_body
h=$(shasum -a 256 /tmp/_badge_body | cut -d" " -f1)
{ printf "<!-- @ds-ejected from=\"shadcn-vue/badge\" version=\"0.11.0\" sha256=\"%s\" -->
" "$h"; cat /tmp/_badge_body; } > app/components/ui/AppBadge.vue
body_chip='<!-- AppChip — ejected from shadcn-vue. -->
<script setup lang="ts">
defineProps<{ label: string }>()
</script>
<template><span class="rounded-full px-[var(--space-2)]">{{ label }}</span></template>
'
printf "%s" "$body_chip" > /tmp/_chip_body
h=$(shasum -a 256 /tmp/_chip_body | cut -d" " -f1)
{ printf "<!-- @ds-ejected from=\"shadcn-vue/chip\" version=\"0.11.0\" sha256=\"%s\" -->
" "$h"; cat /tmp/_chip_body; } > app/components/ui/AppChip.vue
# the edit after ejecting, marker not refreshed:
sed -i.bak "s/rounded-full/rounded-[var(--radius-md)]/" app/components/ui/AppChip.vue && rm -f app/components/ui/AppChip.vue.bak
rm -f /tmp/_badge_body /tmp/_chip_body
printf "export { default as AppBadge } from './AppBadge.vue'
export { default as AppChip } from './AppChip.vue'
" > app/components/ui/index.ts
