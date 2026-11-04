#!/usr/bin/env bash
# Nuxt 4 app where the ONLY cross-module access is through a DYNAMIC import with a NON-LITERAL
# specifier: the "admin" page builds the module path at runtime from a variable and import()s it.
# Statically, no tool can know which file this resolves to (it could be a public entry or a private
# internal, depending on runtime data). The honest answer is "cannot tell from static analysis":
# a correct auditor must NOT claim a boundary break it cannot see, and must NOT invent one.
set -euo pipefail
mkdir -p app/features/metrics/internal app/pages/admin

cat > package.json <<'EOF'
{ "name": "arch-dynamic-app", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/features/metrics/index.ts <<'EOF'
export { useMetrics } from './useMetrics'
EOF
cat > app/features/metrics/useMetrics.ts <<'EOF'
export function useMetrics() { return { count: 0 } }
EOF
cat > app/features/metrics/internal/secret.ts <<'EOF'
export function rawCounters(): number[] { return [1, 2, 3] }
EOF

# The admin page builds the path at runtime: a non-literal dynamic import, unknowable statically.
cat > app/pages/admin/index.vue <<'EOF'
<script setup lang="ts">
const which = Math.random() > 0.5 ? 'index' : 'internal/secret'
async function load() {
  const mod = await import(`~/features/metrics/${which}`)
  return mod
}
</script>
<template><button @click="load">load</button></template>
EOF
echo "scaffolded arch-dynamic-app"
