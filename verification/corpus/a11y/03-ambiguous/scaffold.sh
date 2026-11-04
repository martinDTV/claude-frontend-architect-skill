#!/usr/bin/env bash
# Nuxt 4 app with a heading outline that jumps from <h1> straight to <h3>, skipping <h2>.
# This is GENUINELY ambiguous from static markup: it may be a real outline defect (a missing
# section level that confuses screen-reader navigation), OR the author may have picked <h3> only
# for its smaller default size and the document is otherwise a flat list of equal subsections.
# Static analysis cannot tell intent, so the only honest level is heuristic/review: worth a human
# read, never a confirmed defect. A correct auditor reports heading-level-skipped at review level.
set -euo pipefail
mkdir -p app/components/content

cat > package.json <<'EOF'
{ "name": "a11y-ambiguous", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022", "strict": true, "noEmit": true, "baseUrl": ".", "paths": { "~/*": ["./app/*"] } }, "include": ["app/**/*"] }
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/components/content/Article.vue <<'EOF'
<template>
  <article>
    <h1>Release notes</h1>
    <h3>Highlights</h3>
    <p>What changed this week.</p>
    <h3>Fixes</h3>
    <p>Smaller corrections.</p>
  </article>
</template>
EOF
echo "scaffolded a11y-ambiguous"
