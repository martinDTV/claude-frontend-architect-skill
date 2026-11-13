#!/usr/bin/env bash
# No index.ts under the root: every component is public by construction. AppKpi and AppMeter have no documentation
# in any form and must both be reported; AppSpark is documented by a sibling AppSpark.md and must not.
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

cat > app/components/ui/AppKpi.vue <<'EOF'
<script setup lang="ts">
defineProps<{ label: string; value: number }>()
</script>
<template><dl><dt>{{ label }}</dt><dd>{{ value }}</dd></dl></template>
EOF
cat > app/components/ui/AppMeter.vue <<'EOF'
<script setup lang="ts">
defineProps<{ value: number; max?: number }>()
</script>
<template><meter :value="value" :max="max ?? 100" /></template>
EOF
cat > app/components/ui/AppSpark.vue <<'EOF'
<script setup lang="ts">
defineProps<{ points: number[] }>()
</script>
<template><svg viewBox="0 0 100 20"><polyline :points="points.map((p, i) => `${i},${20 - p}`).join(' ')" fill="none" stroke="currentColor" /></svg></template>
EOF
printf "# AppSpark

A tiny sparkline. \`<AppSpark :points=\"[1,4,2]\" />\`
" > app/components/ui/AppSpark.md
