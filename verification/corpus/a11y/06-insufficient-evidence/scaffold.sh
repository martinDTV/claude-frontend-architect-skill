#!/usr/bin/env bash
# Nuxt 4 app where the evidence to judge a control is simply not in the file. A base input component
# forwards ALL of its parent's attributes to the native <input> with v-bind="$attrs". Whether the input
# ends up with an aria-label / id / for-association depends ENTIRELY on what each caller spreads in, which
# this file cannot see. Read by a human: you cannot decide from this source whether the control is named,
# so you must abstain. A correct auditor reports NO defect here -- it treats the spread element as
# unverifiable -- and inventing a missing-label finding would be a false positive on unknowable evidence.
set -euo pipefail
mkdir -p app/components/base

cat > package.json <<'EOF'
{ "name": "a11y-insufficient-evidence", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
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

cat > app/components/base/BaseInput.vue <<'EOF'
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const model = defineModel<string>()
</script>
<template>
  <input v-model="model" v-bind="$attrs" />
</template>
EOF
echo "scaffolded a11y-insufficient-evidence"
