#!/usr/bin/env bash
# B-02 (set B, blind). No barrel, so every root component is public. StatusPill.vue carries no comment at all but
# has a sibling StatusPill.stories.ts — the contract counts a sibling *.stories.* as documentation (trap).
# Kbd.vue has no comment, no @example, no sibling .md or .stories.* — the genuine undocumented public component.
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-holdout-b02", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0" }, "devDependencies": { "@storybook/vue3": "^8.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --color-success-500: #16a34a; --color-danger-500: #dc2626; --space-1: 0.25rem; --radius-full: 9999px; }
EOF

cat > app/components/ui/StatusPill.vue <<'EOF'
<script setup lang="ts">
const props = defineProps<{ tone: 'success' | 'danger'; label: string }>()
const color = computed(() => props.tone === 'success' ? 'var(--color-success-500)' : 'var(--color-danger-500)')
</script>
<template>
  <span class="status-pill" :style="{ backgroundColor: color }">{{ props.label }}</span>
</template>
<style scoped>
.status-pill { padding: var(--space-1); border-radius: var(--radius-full); }
</style>
EOF

cat > app/components/ui/StatusPill.stories.ts <<'EOF'
import type { Meta, StoryObj } from '@storybook/vue3'
import StatusPill from './StatusPill.vue'

const meta: Meta<typeof StatusPill> = { title: 'UI/StatusPill', component: StatusPill }
export default meta

export const Success: StoryObj<typeof StatusPill> = { args: { tone: 'success', label: 'Paid' } }
export const Danger: StoryObj<typeof StatusPill> = { args: { tone: 'danger', label: 'Overdue' } }
EOF

cat > app/components/ui/Kbd.vue <<'EOF'
<script setup lang="ts">
defineProps<{ keys: string[] }>()
</script>
<template>
  <span class="kbd"><kbd v-for="k in keys" :key="k">{{ k }}</kbd></span>
</template>
<style scoped>
.kbd kbd { padding: var(--space-1); }
</style>
EOF
