#!/usr/bin/env bash
# Nuxt 4 app with a GENUINE, provable accessibility defect: a login form whose password
# <input> has no label at all. Read by a human: the field has no id that any <label for>
# points to, it is not wrapped in a <label>, and it carries no aria-label / aria-labelledby /
# title. A screen-reader user lands on an unnamed edit field. The username input above it is
# correctly labelled (a <label for> + matching id), so this is one defect, not two, and the
# labelled control is the control; the unlabelled one is the finding.
set -euo pipefail
mkdir -p app/components/auth

cat > package.json <<'EOF'
{ "name": "a11y-real-defect", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
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

cat > app/components/auth/LoginForm.vue <<'EOF'
<script setup lang="ts">
import { ref } from 'vue'
const username = ref('')
const password = ref('')
</script>
<template>
  <form @submit.prevent>
    <label for="username">Username</label>
    <input id="username" v-model="username" type="text" />
    <input id="password" v-model="password" type="password" />
    <button type="submit">Sign in</button>
  </form>
</template>
EOF
echo "scaffolded a11y-real-defect"
