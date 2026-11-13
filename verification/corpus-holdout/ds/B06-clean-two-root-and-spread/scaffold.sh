#!/usr/bin/env bash
# B-06 (set B, blind, category clean). Every public component is documented and nothing is a defect.
#   InlineNotice.vue — TWO root elements: <UAlert v-if> then <div v-else>. No props, no emits, no models, script is
#                      only defineOptions — everything a pass-through has EXCEPT a single library root. Not a
#                      wrapper, not a pass-through (trap).
#   AppSelect.vue    — props spread from an import (`...selectProps`) → the contract's info-level
#                      props-partially-resolved, which is not a defect level (out_of_scope).
#   AppButtonLink.vue — wrapper with its own props and an emit: a legitimate wrapper, not a pass-through.
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-holdout-b06", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --color-brand-500: #2563eb; --color-warning-500: #d97706; --space-2: 0.5rem; --space-3: 0.75rem; --radius-md: 0.5rem; }
EOF

cat > app/components/ui/InlineNotice.vue <<'EOF'
<!-- InlineNotice — renders a UAlert when a title slot is given, otherwise a plain inline box around the content. -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>
<template>
  <UAlert v-if="$slots.title" v-bind="$attrs" color="warning">
    <template #title><slot name="title" /></template>
    <slot />
  </UAlert>
  <div v-else class="inline-notice" v-bind="$attrs">
    <slot />
  </div>
</template>
<style scoped>
.inline-notice { padding: var(--space-2); border-left: 3px solid var(--color-warning-500); }
</style>
EOF

cat > app/components/ui/select.props.ts <<'EOF'
import type { PropType } from 'vue'
export const selectProps = {
  items: { type: Array as PropType<Array<{ label: string; value: string }>>, required: true },
  disabled: { type: Boolean, default: false },
} as const
EOF

cat > app/components/ui/AppSelect.vue <<'EOF'
<!-- AppSelect — single-value select; shared props come from select.props.ts so the form kit can reuse them. -->
<script setup lang="ts">
import { selectProps } from './select.props'
const props = defineProps({ ...selectProps, placeholder: { type: String, default: 'Select…' } })
const model = defineModel<string>()
</script>
<template>
  <USelect v-model="model" :items="props.items" :disabled="props.disabled" :placeholder="props.placeholder" />
</template>
EOF

cat > app/components/ui/AppButtonLink.vue <<'EOF'
<!-- AppButtonLink — a UButton that navigates; emits `navigate` before routing so callers can track it. -->
<script setup lang="ts">
const props = defineProps<{ to: string; label: string }>()
const emit = defineEmits<{ navigate: [to: string] }>()
function onClick() { emit('navigate', props.to) }
</script>
<template>
  <UButton :to="props.to" :label="props.label" color="primary" @click="onClick" />
</template>
EOF

cat > app/components/ui/index.ts <<'EOF'
export { default as InlineNotice } from './InlineNotice.vue'
export { default as AppSelect } from './AppSelect.vue'
export { default as AppButtonLink } from './AppButtonLink.vue'
EOF
