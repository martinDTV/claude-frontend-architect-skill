#!/usr/bin/env bash
# Nuxt 4 app with a JSX (.tsx) component carrying SEVERAL independent, genuine accessibility defects at once,
# to check the auditor finds each without letting one mask another, through the JSX parser path:
#   - <img> with no alt                                   -> img-missing-alt (confirmed)
#   - <input> with no label                               -> form-control-without-label (confirmed)
#   - <button> with no text / aria-label / title          -> button-without-accessible-name (confirmed)
#   - <div onClick> with no interactive role              -> click-handler-on-non-interactive (confirmed)
#   - <a onClick> with no href                            -> link-without-href (confirmed)
#   - aria-hidden="true" on a focusable <a href>          -> aria-hidden-on-focusable (confirmed)
# Read by a human from the JSX: each is provable from the markup alone and independent of the others.
# A correct auditor reports all six at confirmed level.
set -euo pipefail
mkdir -p app/components/ui

cat > package.json <<'EOF'
{ "name": "a11y-combined-defects", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022", "strict": true, "noEmit": true, "jsx": "preserve", "baseUrl": ".", "paths": { "~/*": ["./app/*"] } }, "include": ["app/**/*"] }
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/components/ui/Toolbar.tsx <<'EOF'
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'Toolbar',
  setup() {
    const run = () => {}
    return () => (
      <section>
        <img src="/logo.png" />
        <input type="text" />
        <button type="button"></button>
        <div onClick={run}>Run</div>
        <a onClick={run}>Open</a>
        <a href="/next" aria-hidden="true">Next</a>
      </section>
    )
  },
})
EOF
echo "scaffolded a11y-combined-defects"
