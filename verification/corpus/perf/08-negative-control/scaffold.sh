#!/usr/bin/env bash
# Nuxt 4 app written correctly throughout: a negative control that must raise ZERO defect-level findings.
# Every pattern that COULD be a defect is done the right way, so a correct auditor reports nothing and must
# not invent anything:
#   - Dashboard.vue keys its v-for by a stable id (not index, not a fresh value);
#   - its computed `total` is a PURE derivation (sums a local total, no fetch/emit/storage/DOM/router);
#   - it watches a SPECIFIC getter (`watch(() => state.filter, ...)`), not the whole reactive object, so no
#     implicit deep traversal;
#   - the only heavy dependency (@codemirror/view) is reached as a TYPE-ONLY import (erased at build) plus a
#     DYNAMIC import() inside onMounted, so nothing heavy is statically value-imported into the client tree.
# None of these should trip heavy-static-import, computed-side-effect, reactive-deep-watch or any key rule.
# No installs, no network.
set -euo pipefail
mkdir -p app/components app/pages

cat > package.json <<'EOF'
{ "name": "perf-clean-control-app", "private": true, "dependencies": { "nuxt": "4.0.0", "vue": "3.5.0", "@codemirror/view": "6.28.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF

cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/pages/index.vue <<'EOF'
<template><Dashboard /></template>
EOF

# Clean composition: stable keys, a pure computed, a specific-getter watch.
cat > app/components/Dashboard.vue <<'EOF'
<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
const state = reactive({ filter: 'all', rows: [{ id: 'a', value: 3 }, { id: 'b', value: 4 }] })
// PURE computed: derives a number from state, no side effect.
const total = computed(() => state.rows.reduce((sum, r) => sum + r.value, 0))
// SPECIFIC-getter watch: only state.filter, not the whole reactive object.
watch(() => state.filter, () => { /* react to the filter only */ })
</script>
<template>
  <section>
    <h1>Dashboard</h1>
    <ul><li v-for="r in state.rows" :key="r.id">{{ r.value }}</li></ul>
    <p>Total: {{ total }}</p>
    <CodeView />
  </section>
</template>
EOF

# The only heavy dependency is reached as a TYPE-ONLY import plus a DYNAMIC import(): nothing heavy is
# statically value-imported.
cat > app/components/CodeView.vue <<'EOF'
<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
const host = ref<HTMLElement | null>(null)
const view = ref<EditorView | null>(null)
onMounted(async () => {
  if (!host.value) return
  const { EditorView: EV } = await import('@codemirror/view')
  view.value = new EV({ parent: host.value })
})
</script>
<template><div ref="host" /></template>
EOF

echo "scaffolded perf-clean-control-app"
