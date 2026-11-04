#!/usr/bin/env bash
# Nuxt 4 app: the SAME defect -- a form control with no accessible name -- written three ways.
#   A) a native <input type="text"> with no label at all               (form-control-without-label)
#   B) a native <select> with no label at all                          (form-control-without-label, different tag)
#   C) a native <textarea> with no label at all                        (form-control-without-label, different tag)
# Read by a human: all three are the identical semantic defect expressed in different markup; a correct
# auditor must report form-control-without-label on each, at confirmed level, because the semantic engine
# proves none of them has a <label for>, wrapping <label>, aria-label, aria-labelledby or title.
# A fourth control, a custom <div role="textbox"> editable widget with no name, is the SAME defect in a
# non-native syntax that ui-audit deliberately does NOT cover (it only names native elements); it is listed
# out_of_scope so the known blind spot is documented, not scored as an unfair miss.
set -euo pipefail
mkdir -p app/components/forms

cat > package.json <<'EOF'
{ "name": "a11y-syntactic-variant", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
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

cat > app/components/forms/SearchControls.vue <<'EOF'
<script setup lang="ts">
import { ref } from 'vue'
const q = ref('')
const notes = ref('')
</script>
<template>
  <div>
    <input v-model="q" type="text" />
    <select name="sort"><option value="new">Newest</option></select>
    <textarea v-model="notes"></textarea>
    <div role="textbox" tabindex="0" contenteditable="true"></div>
  </div>
</template>
EOF
echo "scaffolded a11y-syntactic-variant"
