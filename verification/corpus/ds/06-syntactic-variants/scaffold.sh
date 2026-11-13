#!/usr/bin/env bash
# Syntactic variants that must NOT produce false positives: props typed through an interface declared AFTER
# defineProps, emits as a string array, defineModel() with the default name, a dynamically named slot, and
# documentation as a JSDoc block before defineProps instead of a leading HTML comment.
set -euo pipefail
mkdir -p app/components/ui app/assets/css
cat > package.json <<'EOF'
{ "name": "ds-case", "private": true, "dependencies": { "nuxt": "^4.6.0", "@nuxt/ui": "^4.4.0", "tailwind-variants": "^1.0.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', modules: ['@nuxt/ui'], css: ['~/assets/css/tokens.css'] })
EOF
cat > app/assets/css/tokens.css <<'EOF'
:root { --color-brand-500: #2563eb; --space-2: 0.5rem; --radius-md: 0.5rem; }
EOF

cat > app/components/ui/AppSelect.vue <<'EOF'
<script setup lang="ts">
/**
 * AppSelect — a labelled native select.
 * @example <AppSelect v-model="value" :options="options" label="Country" />
 */
const props = defineProps<Props>()
const emit = defineEmits(["change", "blur"])
const model = defineModel<string | null>()
interface Props { options: { value: string; label: string }[]; label: string; placeholder?: string }
</script>
<template>
  <label>{{ props.label }}
    <select :value="model ?? ''" @change="emit('change')" @blur="emit('blur')">
      <option v-for="o in options" :key="o.value" :value="o.value"><slot :name="`option-${o.value}`">{{ o.label }}</slot></option>
    </select>
  </label>
</template>
EOF
echo "export { default as AppSelect } from './AppSelect.vue'" > app/components/ui/index.ts
