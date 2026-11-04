#!/usr/bin/env bash
# Creates a small Nuxt 4 app whose only state finding is AMBIGUOUS: a module-level mutable binding whose
# real risk (a cross-request leak) depends on whether this app server-renders. No installs, no network.
#   - a `let currentFilter = null` plus a module-level Map cache live at module scope in a composable
#   - these run on the server too IF ssr is on; the honest call names the ambiguity rather than asserting
#     an active cross-request leak without checking the rendering mode.
# No tokens in storage, no module-level HTTP client with a mutated auth header: nothing is confirmed here.
set -euo pipefail
mkdir -p app/composables app/pages
cat > package.json <<'EOF'
{ "name": "eval-state-ambiguous", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF
cat > app/composables/useCatalog.ts <<'EOF'
// Module scope: this binding and the cache are created once per server process, not per request.
// Whether that is a cross-request leak depends on whether this app runs with SSR.
let currentFilter: string | null = null
const cache = new Map<string, unknown>()
export function useCatalog() {
  function setFilter(f: string) { currentFilter = f }
  async function list() {
    if (cache.has(currentFilter ?? '')) return cache.get(currentFilter ?? '')
    const data = await $fetch('/api/catalog', { query: { filter: currentFilter } })
    cache.set(currentFilter ?? '', data)
    return data
  }
  return { setFilter, list }
}
EOF
cat > app/pages/index.vue <<'EOF'
<script setup lang="ts">
const { list } = useCatalog()
const { data } = await useAsyncData('catalog', () => list())
</script>
<template><p>{{ data }}</p></template>
EOF
echo "scaffolded eval-state-ambiguous"
