#!/usr/bin/env bash
# BLIND GENERALIZATION hold-out, a11y. Precision case: new-looking but fully correct markup, built to trip the
# a11y rules and stay quiet. Different from the development negative control (dev a11y/08 was a labelled form):
# this is a navigation/media surface whose traps are different rules and different carriers.
#   - an icon-only <button> named by a STATIC aria-label (not text)          -> button-without-accessible-name must NOT fire
#   - a decorative <img> with role="presentation" and no alt                 -> img-missing-alt must NOT fire
#   - a decorative <img alt="">                                              -> img-missing-alt must NOT fire
#   - a native <table> that DOES contain <th scope>                          -> table-without-headers must NOT fire
#   - an <a href> used for navigation with visible text                      -> link-without-href must NOT fire
#   - a hover row that pairs @mouseenter WITH @focus                         -> mouse-only-handler must NOT fire
# Every control is read by hand to have a correct accessible name / semantics; a correct auditor fires zero
# defect-level findings. Vue SFC parsed by the semantic engine.
set -euo pipefail
mkdir -p app/components/nav

cat > package.json <<'EOF'
{ "name": "a11y-holdout-named-traps", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
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

cat > app/components/nav/MediaBar.vue <<'EOF'
<script setup lang="ts">
const preview = () => {}
const show = () => {}
</script>
<template>
  <nav>
    <button type="button" aria-label="Open menu">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M0 0h16v2H0z" /></svg>
    </button>
    <img src="/divider.png" role="presentation" />
    <img src="/spacer.png" alt="" />
    <a href="/pricing">Pricing</a>
    <div @mouseenter="preview" @focus="preview">Hover or focus for a preview</div>
    <table>
      <thead>
        <tr><th scope="col">Plan</th><th scope="col">Price</th></tr>
      </thead>
      <tbody>
        <tr><td>Pro</td><td>$9</td></tr>
      </tbody>
    </table>
  </nav>
</template>
EOF
echo "scaffolded a11y-holdout-named-traps"
