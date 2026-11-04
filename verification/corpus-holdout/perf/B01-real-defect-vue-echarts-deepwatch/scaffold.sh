#!/usr/bin/env bash
# GENERALIZATION (set B). Vue 3 / Nuxt component with two genuine performance patterns on carriers the
# development corpus does not use for these ids:
#   DEFECT A (heavy-static-import, heuristic): `import * as echarts from 'echarts'` — a charting runtime
#             pulled in as a STATIC value import in a client-reachable component (dev corpus flagged
#             apexcharts/chart.js only via dynamic/type-only traps; a static echarts import is the real
#             shipping cost). Not type-only, not dynamic.
#   DEFECT B (reactive-deep-watch, heuristic): `watch(state, ...)` where state is a reactive() object, so
#             Vue deep-traverses the whole object on every change instead of watching a specific getter.
# A component on the initial route (below-the-fold reasoning does not exempt a static import from the bundle).
set -euo pipefail
mkdir -p app/components

cat > package.json <<'EOF'
{ "name": "holdout-perf-vue-echarts", "private": true, "dependencies": { "nuxt": "3.14.0", "vue": "3.5.12", "echarts": "5.5.1" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ ssr: true })
EOF

# DEFECT A + B live here.
cat > app/components/SalesChart.vue <<'EOF'
<script setup lang="ts">
import { reactive, watch } from 'vue'
import * as echarts from 'echarts'

const state = reactive({ range: '7d', series: [] as number[], label: '' })

watch(state, () => {
  const el = document.getElementById('chart')
  if (el) echarts.init(el).setOption({ series: [{ data: state.series }] })
})
</script>

<template>
  <section>
    <h2>Sales</h2>
    <div id="chart" />
  </section>
</template>
EOF

echo "scaffolded holdout-perf-vue-echarts"
