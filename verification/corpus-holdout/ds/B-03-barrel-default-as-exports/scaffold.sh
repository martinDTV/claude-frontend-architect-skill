#!/usr/bin/env bash
# B-03 (set B, blind). The barrel uses `export { default as X } from './X.vue'` (not `export *`) plus a type-only
# export. Card (exported, documented) is clean; CardHeader (exported, undocumented) is the real finding;
# CardSkeleton (NOT exported, undocumented) is private and therefore never a finding per the contract (trap).
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-holdout-b03", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --color-surface: #ffffff; --color-border: #e5e7eb; --space-4: 1rem; --radius-lg: 0.75rem; --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05); }
EOF

cat > app/components/ui/Card.vue <<'EOF'
<!--
  Card — surface container with optional header and footer slots.
  @example <Card padded><template #header>Title</template>Body</Card>
-->
<script setup lang="ts">
export interface CardProps { padded?: boolean }
withDefaults(defineProps<CardProps>(), { padded: true })
</script>
<template>
  <section class="card" :class="{ 'card--padded': padded }">
    <slot name="header" />
    <slot />
    <slot name="footer" />
  </section>
</template>
<style scoped>
.card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.card--padded { padding: var(--space-4); }
</style>
EOF

cat > app/components/ui/CardHeader.vue <<'EOF'
<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>
<template>
  <header class="card-header">
    <h3>{{ title }}</h3>
    <p v-if="subtitle">{{ subtitle }}</p>
    <slot name="actions" />
  </header>
</template>
EOF

cat > app/components/ui/CardSkeleton.vue <<'EOF'
<script setup lang="ts">
defineProps<{ lines?: number }>()
</script>
<template>
  <div class="card-skeleton" aria-hidden="true">
    <USkeleton v-for="i in (lines ?? 3)" :key="i" class="h-4 w-full" />
  </div>
</template>
EOF

cat > app/components/ui/index.ts <<'EOF'
export { default as Card } from './Card.vue'
export { default as CardHeader } from './CardHeader.vue'
export type { CardProps } from './Card.vue'
EOF
