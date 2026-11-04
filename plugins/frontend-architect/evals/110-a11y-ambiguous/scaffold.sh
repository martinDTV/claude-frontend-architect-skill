#!/usr/bin/env bash
# Creates a small Nuxt 4 app whose only accessibility signal is AMBIGUOUS and needs interpretation, not
# alarm: an article card jumps from <h1> straight to <h3>, skipping <h2>. Whether this is a real problem
# is a JUDGEMENT CALL: a skipped heading level can be a genuine document-structure defect (a screen-reader
# user loses an outline step) OR a deliberate visual choice where the h3 is only styled smaller and the
# real fix is CSS, not a level change. ui-audit cannot know the author's intent from the markup, so it
# reports this as REVIEW (heuristic), a reader must decide. Everything else in the markup is accessible, so
# the heading jump is the only thing to weigh. No installs, no network.
set -euo pipefail
mkdir -p app/components app/pages

cat > package.json <<'EOF'
{ "name": "a11y-ambiguous-app", "private": true, "dependencies": { "nuxt": "^4.6.0", "vue": "^3.5.0" } }
EOF

cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF

cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

# THE AMBIGUOUS SIGNAL: the heading jumps from h1 to h3 (no h2). Deliberate styling or a real structure bug?
cat > app/components/ArticleCard.vue <<'EOF'
<template>
  <article>
    <h1>Quarterly report</h1>
    <h3>Revenue</h3>
    <p>Revenue rose 12% quarter over quarter.</p>
    <img src="/chart.png" alt="Revenue trend, up 12 percent">
  </article>
</template>
EOF

cat > app/pages/index.vue <<'EOF'
<template>
  <main>
    <ArticleCard />
  </main>
</template>
EOF

echo "scaffolded a11y-ambiguous-app"
