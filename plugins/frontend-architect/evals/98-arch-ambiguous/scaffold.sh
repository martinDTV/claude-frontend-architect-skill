#!/usr/bin/env bash
# Creates a small, realistic Nuxt 4 app whose only architecture signal is AMBIGUOUS and needs
# interpretation, not alarm: the default layout (shell) uses a composable that the project's own
# classification assigns to the "reporting" business domain. The edge is an AUTO-IMPORT that this tool
# resolves only by re-implementing Nuxt's scanning rules, so it is reported as HEURISTIC (inferred),
# not a hard, verified violation. A reviewer must decide whether a header KPI widget is really a
# business-domain dependency or shared chrome, and confirm with `nuxt prepare` before acting.
# No installs, no network.
set -euo pipefail
mkdir -p app/layouts app/pages/reports app/composables

cat > package.json <<'EOF'
{ "name": "arch-ambiguous-app", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF

# Project's own classification: the reporting composable is declared a business domain; layouts are shell.
cat > .frontend-audit.json <<'EOF'
{
  "domains": {
    "reporting": ["app/composables/useReportingSummary.ts"]
  },
  "shell": ["app/layouts/**", "app/middleware/**"]
}
EOF

cat > app/app.vue <<'EOF'
<template><NuxtLayout><NuxtPage /></NuxtLayout></template>
EOF

# Shell layout uses the reporting composable WITHOUT an explicit import (Nuxt auto-import).
# Whether this header KPI counts as a business-domain dependency is a judgement call.
cat > app/layouts/default.vue <<'EOF'
<script setup lang="ts">
const { openCount } = useReportingSummary()
</script>
<template>
  <div>
    <header>Open: {{ openCount }}</header>
    <slot />
  </div>
</template>
EOF

cat > app/composables/useReportingSummary.ts <<'EOF'
export function useReportingSummary() {
  const openCount = useState<number>('reporting-open', () => 0)
  return { openCount }
}
EOF

cat > app/pages/reports/index.vue <<'EOF'
<script setup lang="ts">
const { openCount } = useReportingSummary()
</script>
<template><p>{{ openCount }}</p></template>
EOF

echo "scaffolded arch-ambiguous-app"
