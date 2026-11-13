#!/usr/bin/env bash
# B-04 (set B, blind). Two ejected copies with the @ds-ejected marker. Each marker's sha256 is computed here, in the
# scaffold, over the file WITHOUT the marker line (the contract's definition), with shasum -a 256.
#   AppTooltip.vue — body written exactly as hashed → hash matches → not drifted (trap: must stay silent).
#   AppToast.vue   — hash computed over the original body, then the body is re-indented (2 → 4 spaces) and a
#                    trailing blank line is appended BEFORE writing the file. Only whitespace changed, but the
#                    contract hashes bytes, so any byte change = drifted (confirmed).
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-holdout-b04", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --color-brand-500: #7c3aed; --space-2: 0.5rem; --radius-md: 0.5rem; --duration-fast: 150ms; }
EOF

# --- AppTooltip: ejected, hash fresh ---
cat > .tooltip-body <<'EOF'
<!-- AppTooltip — ejected copy of UTooltip with a shorter delay; keep the marker hash fresh when editing. -->
<script setup lang="ts">
defineProps<{ text: string; delay?: number }>()
</script>
<template>
  <UTooltip :text="text" :delay-duration="delay ?? 150">
    <slot />
  </UTooltip>
</template>
EOF
TOOLTIP_HASH=$(shasum -a 256 .tooltip-body | cut -d' ' -f1)
{
  printf '<!-- @ds-ejected from="nuxt-ui/tooltip" version="4.4.0" sha256="%s" -->\n' "$TOOLTIP_HASH"
  cat .tooltip-body
} > app/components/ui/AppTooltip.vue
rm .tooltip-body

# --- AppToast: hash the ORIGINAL body, then apply a whitespace-only edit ---
cat > .toast-body <<'EOF'
<!-- AppToast — ejected copy of UToast with our own icon map. -->
<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>
<template>
  <UToast :title="title" :description="description" @update:open="emit('close')">
    <template #actions>
      <slot name="actions" />
    </template>
  </UToast>
</template>
EOF
TOAST_HASH=$(shasum -a 256 .toast-body | cut -d' ' -f1)
# whitespace-only edit: re-indent leading two-space runs to four spaces and add a trailing blank line
sed 's/^  /    /' .toast-body > .toast-body-edited
printf '\n' >> .toast-body-edited
if cmp -s .toast-body .toast-body-edited; then echo "scaffold error: edit did not change the body" >&2; exit 1; fi
{
  printf '<!-- @ds-ejected from="nuxt-ui/toast" version="4.4.0" sha256="%s" -->\n' "$TOAST_HASH"
  cat .toast-body-edited
} > app/components/ui/AppToast.vue
rm .toast-body .toast-body-edited

cat > app/components/ui/index.ts <<'EOF'
export { default as AppTooltip } from './AppTooltip.vue'
export { default as AppToast } from './AppToast.vue'
EOF
