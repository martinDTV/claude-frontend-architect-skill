#!/usr/bin/env bash
# Nuxt 4 app that LOOKS heavy but is correctly code-split, so a correct auditor must report NOTHING.
# Every heavy dependency is reached in a way that keeps it off the startup bundle:
#   - the rich-text editor (@tiptap/vue-3) is loaded with defineAsyncComponent(() => import(...)), a
#     DYNAMIC import, not a static one;
#   - the charting runtime (apexcharts) is loaded with a DYNAMIC import() inside onMounted, so it is
#     fetched only when the panel mounts;
#   - the editor's TYPES come in via `import type { Editor } from '@tiptap/vue-3'`, which is erased at
#     build time and ships no runtime code.
# There is no static value import of any heavy module anywhere in the client tree. A reviewer who only
# skims the import list might flag this ("it uses tiptap and apexcharts!"), but reading how they are
# imported shows the code is already correct. This is the trap for a false positive. No installs/network.
set -euo pipefail
mkdir -p app/components app/pages

cat > package.json <<'EOF'
{ "name": "perf-split-app", "private": true, "dependencies": { "nuxt": "4.0.0", "vue": "3.5.0", "@tiptap/vue-3": "2.6.0", "apexcharts": "3.49.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF

cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/pages/index.vue <<'EOF'
<script setup lang="ts">
const items = [{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }]
</script>
<template>
  <section>
    <h1>Notes</h1>
    <ul><li v-for="it in items" :key="it.id">{{ it.label }}</li></ul>
    <NotesEditor />
  </section>
</template>
EOF

# The editor runtime is loaded DYNAMICALLY (defineAsyncComponent + import()), and only its TYPE is
# imported statically (erased at build). No static value import of a heavy module here.
cat > app/components/NotesEditor.vue <<'EOF'
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { Editor } from '@tiptap/vue-3'
const EditorBody = defineAsyncComponent(() => import('@tiptap/vue-3').then((m) => m.EditorContent))
const editor = ref<Editor | null>(null)
</script>
<template><component :is="EditorBody" :editor="editor" /></template>
EOF

# The chart runtime is loaded with a DYNAMIC import() inside onMounted: off the startup bundle.
cat > app/components/ChartPanel.vue <<'EOF'
<script setup lang="ts">
const el = ref<HTMLElement | null>(null)
onMounted(async () => {
  if (!el.value) return
  const { default: ApexCharts } = await import('apexcharts')
  new ApexCharts(el.value, { series: [], chart: { type: 'bar' } }).render()
})
</script>
<template><div ref="el" /></template>
EOF

echo "scaffolded perf-split-app"
