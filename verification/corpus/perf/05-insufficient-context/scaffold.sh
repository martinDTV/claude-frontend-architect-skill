#!/usr/bin/env bash
# Nuxt 4 app with a GENUINE computed-side-effect, but the effect sits ONE CALL away from the getter, so
# seeing it requires following a function call the static detector does not follow. In Prices.vue a
# computed getter calls a local helper refreshRate(), and refreshRate() is the one that performs the I/O
# (`$fetch('/api/rate')`). The defect is real: every time the computed re-evaluates it triggers a network
# call, which a computed (a pure derivation) must never do. A reviewer who READS refreshRate sees it at
# once. But a detector that only inspects the getter's own body — not the bodies of functions it calls —
# cannot see the $fetch, because within `computed(() => { refreshRate(); return rate.value })` the getter
# text contains no fetch/emit/storage/DOM/router token. This is the insufficient-context case: the truth
# is a defect, but the evidence the tool reads is one level too shallow. No installs, no network.
set -euo pipefail
mkdir -p app/components app/pages

cat > package.json <<'EOF'
{ "name": "perf-indirect-app", "private": true, "dependencies": { "nuxt": "4.0.0", "vue": "3.5.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF

cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/pages/index.vue <<'EOF'
<template><Prices /></template>
EOF

# THE DEFECT: the computed getter calls refreshRate(), which performs the I/O. The effect is real but
# one call-level deeper than the getter body the detector inspects.
cat > app/components/Prices.vue <<'EOF'
<script setup lang="ts">
import { computed, ref } from 'vue'
const rate = ref(1)
async function refreshRate() {
  rate.value = await $fetch<number>('/api/rate')
}
// A computed must be a pure derivation, but this one triggers a network call on every re-evaluation,
// via refreshRate(). That is a genuine side effect in a computed getter.
const converted = computed(() => {
  refreshRate()
  return rate.value * 100
})
</script>
<template><div>{{ converted }}</div></template>
EOF

echo "scaffolded perf-indirect-app"
