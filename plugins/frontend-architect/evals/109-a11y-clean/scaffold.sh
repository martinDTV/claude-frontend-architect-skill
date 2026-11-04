#!/usr/bin/env bash
# Creates a small, realistic Nuxt 4 app with NO accessibility defect: the same signup panel as the
# positive case, done correctly.
#   - the email input is associated with a <label for>/id pair;
#   - the icon button has an accessible name via aria-label;
#   - the brand image has a meaningful alt;
#   - the modal has role="dialog" AND an accessible name via aria-label.
# ui-audit (semantic engine) must find nothing and the model must NOT invent a defect. No installs, no network.
set -euo pipefail
mkdir -p app/components app/pages

cat > package.json <<'EOF'
{ "name": "a11y-clean-app", "private": true, "dependencies": { "nuxt": "^4.6.0", "vue": "^3.5.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF

cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

# Every control is accessible: labelled input, named button, alt on the image, named dialog.
cat > app/components/SignupPanel.vue <<'EOF'
<script setup lang="ts">
const email = ref('')
</script>
<template>
  <div role="dialog" aria-label="Newsletter signup">
    <img src="/logo.png" alt="Acme logo">
    <label for="email">Email address</label>
    <input id="email" v-model="email" type="email" placeholder="you@example.com">
    <button type="button" class="icon-send" aria-label="Send signup" />
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

echo "scaffolded a11y-clean-app"
