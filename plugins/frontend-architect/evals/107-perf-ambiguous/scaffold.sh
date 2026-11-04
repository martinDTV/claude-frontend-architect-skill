#!/usr/bin/env bash
# Creates a small Nuxt 4 app whose only performance signal is AMBIGUOUS and needs interpretation, not
# alarm: an analytics panel statically imports the chart.js runtime (a known-heavy charting library).
# Whether this is a real problem is a JUDGEMENT CALL: if the panel is on the initial, above-the-fold
# route it hurts startup; if the dashboard is a secondary route reached after login, the cost is paid
# where it is used and the static import may be fine. perf-audit reports this as HEURISTIC (a bundle
# signal to confirm with a real build), never a measured slowdown. The list is keyed by a stable id and
# there is no other defect, so the chart import is the only thing to weigh. No installs, no network.
set -euo pipefail
mkdir -p app/pages app/components

cat > package.json <<'EOF'
{ "name": "perf-ambiguous-app", "private": true, "dependencies": { "nuxt": "4.0.0", "vue": "3.5.0", "chart.js": "4.4.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityVersion: 4, compatibilityDate: '2026-10-01' })
EOF

cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

# The dashboard route renders the analytics panel. Whether this route is on the critical path (and thus
# whether the heavy chart runtime matters at startup) is exactly what a reviewer must decide.
cat > app/pages/dashboard.vue <<'EOF'
<script setup lang="ts">
const series = [{ id: 'q1', value: 10 }, { id: 'q2', value: 20 }, { id: 'q3', value: 15 }]
</script>
<template>
  <section>
    <h1>Dashboard</h1>
    <ul><li v-for="p in series" :key="p.id">{{ p.value }}</li></ul>
    <AnalyticsPanel />
  </section>
</template>
EOF

# THE AMBIGUOUS SIGNAL: a static import of the chart.js runtime in a client component.
cat > app/components/AnalyticsPanel.vue <<'EOF'
<script setup lang="ts">
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)
const canvas = ref<HTMLCanvasElement | null>(null)
onMounted(() => {
  if (!canvas.value) return
  new Chart(canvas.value, { type: 'bar', data: { labels: ['a'], datasets: [{ data: [1] }] } })
})
</script>
<template><canvas ref="canvas" /></template>
EOF

echo "scaffolded perf-ambiguous-app"
