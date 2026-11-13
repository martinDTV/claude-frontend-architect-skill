#!/usr/bin/env bash
# A small, well-formed system: barrel, every public component documented, a wrapper that adds a rule, a complete data
# view, an intact ejected copy, tokens everywhere. The inventory must report nothing at defect level (clean-held).
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
<!-- AppButton — UButton with loading that blocks clicks. @example <AppButton :loading="saving">Save</AppButton> -->
<script setup lang="ts">
const props = defineProps<{ loading?: boolean }>()
const emit = defineEmits<{ click: [e: MouseEvent] }>()
function onClick(e: MouseEvent) { if (!props.loading) emit("click", e) }
</script>
<template><UButton :loading="loading" :disabled="loading" @click="onClick"><slot /></UButton></template>
EOF
cat > app/components/ui/AppTable.vue <<'EOF'
<!-- AppTable — a data region with the five states. -->
<script setup lang="ts">
type View = { status: "loading" } | { status: "empty" } | { status: "error"; message: string } | { status: "partial"; rows: { id: string }[]; failed: number } | { status: "success"; rows: { id: string }[] }
defineProps<{ view: View }>()
</script>
<template>
  <div>
    <USkeleton v-if="view.status === 'loading'" />
    <p v-else-if="view.status === 'empty'">Nothing yet.</p>
    <UAlert v-else-if="view.status === 'error'" color="error" :title="view.message" />
    <template v-else><UAlert v-if="view.status === 'partial'" color="warning" :title="`${view.failed} failed`" /><ul><li v-for="r in view.rows" :key="r.id">{{ r.id }}</li></ul></template>
  </div>
</template>
EOF
body='<!-- AppBadge — ejected from shadcn-vue, owned here. -->
<script setup lang="ts">
defineProps<{ tone?: "neutral" | "brand" }>()
</script>
<template><span :class="tone === '"'"'brand'"'"' ? '"'"'bg-[var(--color-brand-500)] text-white'"'"' : '"'"'border'"'"'"><slot /></span></template>
'
printf "%s" "$body" > /tmp/_b; h=$(shasum -a 256 /tmp/_b | cut -d" " -f1)
{ printf "<!-- @ds-ejected from=\"shadcn-vue/badge\" version=\"0.11.0\" sha256=\"%s\" -->
" "$h"; cat /tmp/_b; } > app/components/ui/AppBadge.vue; rm -f /tmp/_b
printf "export { default as AppButton } from './AppButton.vue'
export { default as AppTable } from './AppTable.vue'
export { default as AppBadge } from './AppBadge.vue'
" > app/components/ui/index.ts
