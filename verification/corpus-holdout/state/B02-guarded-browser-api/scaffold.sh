#!/usr/bin/env bash
# Nuxt 4 app (SSR on by default). GENERALIZATION trap for the browser-api-in-setup rule.
# A composable touches window and localStorage, but EVERY access is correctly guarded so none of
# it runs during server rendering:
#   - readViewport() reads window.innerWidth only inside an onMounted callback (client lifecycle),
#   - getStored() reads localStorage behind an `import.meta.client` guard.
# A human reads this as safe: the setup top level never touches a browser API; the accesses are
# deferred to the client, which is exactly the prescribed fix. A naive "window in a composable =>
# SSR crash" heuristic would over-flag it. This differs from the dev corpus (which has no
# browser-api case at all) and uses a Nuxt composable with onMounted + import.meta.client guards.
set -euo pipefail
mkdir -p app/composables

cat > package.json <<'EOF'
{ "name": "holdout-guarded-browser", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/composables/useViewport.ts <<'EOF'
import { onMounted, ref } from 'vue'

export function useViewport() {
  const width = ref(0)

  onMounted(() => {
    width.value = window.innerWidth
  })

  function getStored(key: string): string | null {
    if (import.meta.client) {
      return localStorage.getItem(key)
    }
    return null
  }

  return { width, getStored }
}
EOF
echo "scaffolded holdout-guarded-browser"
