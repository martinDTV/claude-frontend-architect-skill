#!/usr/bin/env bash
set -euo pipefail
mkdir -p app/components
cat > nuxt.config.ts <<'NC'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
NC
cat > package.json <<'PK'
{ "name": "neg-saas-a11y", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
PK
cat > app/components/FilterBar.vue <<'VUE'
<script setup lang="ts">
const q = defineModel<string>('q')
</script>
<template>
  <div class="filter-bar">
    <input v-model="q" type="text" placeholder="Filter rows" />
    <button aria-label="Clear"><svg aria-hidden="true" /></button>
  </div>
</template>
VUE
echo scaffolded
