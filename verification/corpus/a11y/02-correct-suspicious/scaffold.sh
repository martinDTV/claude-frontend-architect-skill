#!/usr/bin/env bash
# Nuxt 4 app with controls that LOOK unlabelled to a naive scanner but are correctly named:
#   1. a native <input> with no label attribute of its own, nested inside a custom <FormField label="Email">
#      component (the component owns the label). ui-audit calls this "encapsulated" and must NOT report it.
#   2. a native <input> named by aria-labelledby pointing at a visible <h2> id in the same template.
# Read by a human: both controls have an accessible name, so a correct auditor reports NOTHING here.
# This is the trap for the missing-label rule: the control has no <label for> and no local text, yet it
# is accessible. Requires the SEMANTIC engine: only with the parent chain can encapsulation be seen.
set -euo pipefail
mkdir -p app/components/forms

cat > package.json <<'EOF'
{ "name": "a11y-correct-suspicious", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
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

cat > app/components/forms/ProfilePanel.vue <<'EOF'
<script setup lang="ts">
import { ref } from 'vue'
const email = ref('')
const search = ref('')
</script>
<template>
  <section>
    <FormField label="Email address">
      <input v-model="email" type="email" />
    </FormField>
    <h2 id="filters-title">Filter results</h2>
    <input v-model="search" type="search" aria-labelledby="filters-title" />
  </section>
</template>
EOF
echo "scaffolded a11y-correct-suspicious"
