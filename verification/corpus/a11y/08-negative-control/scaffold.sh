#!/usr/bin/env bash
# Nuxt 4 app: a FULLY accessible form, built to be dense with patterns that a naive scanner mis-fires on but
# that are all correct. Read by a human, every control has a name and every rule's precondition is satisfied:
#   - text input labelled by <label for>/id            - select wrapped in a <label>
#   - submit button has visible text                   - icon button named by aria-label, its svg aria-hidden
#   - <img> with a descriptive alt, decorative <img alt="">  - <dialog aria-labelledby> pointing at its heading
#   - heading outline h1 -> h2 (sequential)            - aria-invalid input DOES link its error via aria-describedby
#   - the form has a pending flag in <script setup> and a :disabled submit button (no form-without-pending-state)
# A correct auditor reports ZERO defect-level findings (confirmed or heuristic) on this file.
set -euo pipefail
mkdir -p app/components/forms

cat > package.json <<'EOF'
{ "name": "a11y-negative-control", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
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

cat > app/components/forms/AccessibleForm.vue <<'EOF'
<script setup lang="ts">
import { ref } from 'vue'
const email = ref('')
const role = ref('viewer')
const error = ref('')
const pending = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
async function submit() {
  if (pending.value) return
  pending.value = true
  try {
    await new Promise((r) => setTimeout(r, 10))
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <form @submit.prevent="submit">
    <h1>Invite a teammate</h1>
    <h2>Details</h2>
    <label for="email">Email</label>
    <input id="email" v-model="email" type="email" :aria-invalid="Boolean(error)" aria-describedby="email-error" />
    <p id="email-error" role="alert">{{ error }}</p>
    <label>
      Role
      <select v-model="role"><option value="viewer">Viewer</option></select>
    </label>
    <img src="/team.png" alt="The current team" />
    <img src="/divider.png" alt="" />
    <button type="button" aria-label="Open help" @click="dialog?.showModal()"><svg aria-hidden="true" /></button>
    <button type="submit" :disabled="pending">Send invite</button>
    <dialog ref="dialog" aria-labelledby="dlg-title"><h2 id="dlg-title">Help</h2></dialog>
  </form>
</template>
EOF
echo "scaffolded a11y-negative-control"
