#!/usr/bin/env bash
# FP trap: a wrapper around UModal that ADDS a mandatory title prop, an open model, a close emit and focus-return
# behaviour. It is a legitimate project rule, NOT a pass-through. A correct inventory reports nothing here.
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

cat > app/components/ui/AppDialog.vue <<'EOF'
<!-- AppDialog — UModal with a mandatory title and focus return. @example <AppDialog v-model:open="open" title="Edit" /> -->
<script setup lang="ts">
defineProps<{ title: string }>()
const open = defineModel<boolean>(open, { required: true })
const emit = defineEmits<{ close: [] }>()
const opener = ref<HTMLElement | null>(null)
watch(open, (v) => { if (v) opener.value = document.activeElement as HTMLElement; else opener.value?.focus() })
</script>
<template>
  <UModal v-model:open="open" :title="title" @close="emit('close')"><template #body><slot /></template></UModal>
</template>
EOF
echo "export { default as AppDialog } from './AppDialog.vue'" > app/components/ui/index.ts
