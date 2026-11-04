#!/usr/bin/env bash
# Nuxt 4 app whose single performance signal is AMBIGUOUS: a reporting panel on an admin-only, behind-login
# route statically imports the echarts runtime (a known-heavy charting library). The IMPORT EDGE is
# certain (static value import of a heavy module in a client-reachable SFC). What is ambiguous is the
# IMPACT: echarts on `pages/admin/reports.vue` is paid only by admins who navigate there after login, on a
# secondary route — not on the first paint of the public app. If this were the landing page the cost would
# be a clear regression; here it may well be acceptable. A correct auditor surfaces the static heavy import
# as a HEURISTIC bundle signal (it cannot see route criticality from the source) and must NOT escalate it
# to a confirmed slowdown. Different from increment-2 eval 107 (chart.js on a generic dashboard): here the
# route is explicitly admin/behind-login and the library is echarts. No installs, no network.
set -euo pipefail
mkdir -p app/pages/admin app/components app/middleware

cat > package.json <<'EOF'
{ "name": "perf-reports-app", "private": true, "dependencies": { "nuxt": "4.0.0", "vue": "3.5.0", "echarts": "5.5.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF

cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

# This route is admin-only and reached after login, so whether the heavy chart runtime matters at startup
# is a judgement call the source alone cannot settle.
cat > app/middleware/admin.ts <<'EOF'
export default defineNuxtRouteMiddleware(() => {
  // pretend auth gate: only admins reach the reports route
})
EOF

cat > app/pages/admin/reports.vue <<'EOF'
<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
const rows = [{ id: 'r1', v: 12 }, { id: 'r2', v: 7 }]
</script>
<template>
  <section>
    <h1>Reports</h1>
    <ul><li v-for="r in rows" :key="r.id">{{ r.v }}</li></ul>
    <ReportChart />
  </section>
</template>
EOF

# THE AMBIGUOUS SIGNAL: a static import of the echarts runtime in a client component used only by the
# admin reports route.
cat > app/components/ReportChart.vue <<'EOF'
<script setup lang="ts">
import * as echarts from 'echarts'
const el = ref<HTMLElement | null>(null)
onMounted(() => {
  if (!el.value) return
  echarts.init(el.value).setOption({ series: [{ type: 'bar', data: [1, 2, 3] }] })
})
</script>
<template><div ref="el" /></template>
EOF

echo "scaffolded perf-reports-app"
