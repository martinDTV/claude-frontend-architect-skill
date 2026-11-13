#!/usr/bin/env bash
# Two components without any documentation: AppTag is exported from the barrel (public) and must be reported;
# AppTagInternal is not exported (private to the folder) and must NOT be reported — the rule is about the public surface.
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

cat > app/components/ui/AppTag.vue <<'EOF'
<script setup lang="ts">
defineProps<{ label: string }>()
</script>
<template><span class="rounded-[var(--radius-md)] px-[var(--space-2)]">{{ label }}</span></template>
EOF
cat > app/components/ui/AppTagInternal.vue <<'EOF'
<script setup lang="ts">
defineProps<{ label: string }>()
</script>
<template><span>{{ label }}</span></template>
EOF
echo "export { default as AppTag } from './AppTag.vue'" > app/components/ui/index.ts
