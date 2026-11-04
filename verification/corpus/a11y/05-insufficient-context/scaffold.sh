#!/usr/bin/env bash
# Nuxt 4 app where whether a control is accessible CANNOT be decided from the markup -- only a rendered
# page can tell. A search <input> gets its name from a BOUND :aria-label whose value is a ternary that is
# the empty string in one branch (`query ? 'Clear search' : ''`). Statically the attribute is present, so
# the control is not "missing a label"; but the rendered name may be empty when query is falsy. An icon
# <button> likewise takes its name from a BOUND :aria-label. Read by a human: these are not static defects
# and not clean either -- the truth depends on runtime state. A correct auditor must NOT raise a confirmed
# defect; the honest output is a browser-tier (info) check, which is excluded from the defect counts.
set -euo pipefail
mkdir -p app/components/search

cat > package.json <<'EOF'
{ "name": "a11y-insufficient-context", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022", "strict": true, "noEmit": true, "baseUrl": ".", "paths": { "~/*": ["./app/*"] } }, "include": ["app/**/*"] }
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/components/search/SearchBox.vue <<'EOF'
<script setup lang="ts">
import { ref } from 'vue'
const query = ref('')
</script>
<template>
  <div>
    <input v-model="query" type="search" :aria-label="query ? 'Clear search' : ''" />
    <button type="button" :aria-label="query ? 'Clear' : 'Search'"><svg aria-hidden="true" /></button>
  </div>
</template>
EOF
echo "scaffolded a11y-insufficient-context"
