#!/usr/bin/env bash
# Creates a small, realistic Nuxt 4 app with GENUINE accessibility defects a human recognises at a glance,
# all provable from the markup alone (no screen reader needed to see they are wrong):
#   - an email input with NO associated label (no <label for>, no wrapping label, no aria-label);
#   - an icon-only button with NO accessible name (empty button, icon drawn by CSS) -> a screen reader
#     announces "button";
#   - a decorative/brand image with NO alt attribute;
#   - a modal container with role="dialog" and NO accessible name.
# These are canonical "a screen reader user cannot use this" mistakes, not regex bait. ui-audit (semantic
# engine) reports each as a static/confirmed finding. No installs, no network.
set -euo pipefail
mkdir -p app/components app/pages

cat > package.json <<'EOF'
{ "name": "a11y-positive-app", "private": true, "dependencies": { "nuxt": "^4.6.0", "vue": "^3.5.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF

cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

# THE DEFECTS live here: unlabelled input, empty icon button, image with no alt, dialog with no name.
cat > app/components/SignupPanel.vue <<'EOF'
<script setup lang="ts">
const email = ref('')
</script>
<template>
  <div role="dialog">
    <img src="/logo.png">
    <input v-model="email" type="email" placeholder="you@example.com">
    <button type="button" class="icon-send" />
  </div>
</template>
EOF

cat > app/pages/index.vue <<'EOF'
<template>
  <main>
    <h1>Join the newsletter</h1>
    <SignupPanel />
  </main>
</template>
EOF

echo "scaffolded a11y-positive-app"
