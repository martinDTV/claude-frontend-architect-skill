#!/usr/bin/env bash
# BLIND GENERALIZATION hold-out, a11y — the area's KNOWN WEAK SPOT on an unseen surface. ui-audit judges only
# NATIVE HTML elements; a custom ARIA widget built from a plain <div role="..."> is outside its scope. The
# development set probed this with a <div role="textbox" contenteditable> (dev a11y/04 coverage gap). Here the
# widget is a different ARIA pattern (role="combobox") in a different framework (React/Next .tsx, not Vue), so a
# tool silence here is the SAME coverage gap reproducing on unseen code, not a new FN.
# The <div role="combobox"> has aria-expanded and tabindex="0" but NO accessible name (no aria-label, no
# aria-labelledby, no associated text): a real defect a screen reader would announce as an unnamed combobox.
# ui-audit does not model custom-widget names, so it stays silent — declared here in coverage_gaps[], not expected[].
# The native <label>/<input> pair in the same file is correct and must not be flagged (precision guard).
set -euo pipefail
mkdir -p src/components/search

cat > package.json <<'EOF'
{ "name": "a11y-holdout-combobox-noname", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022", "strict": true, "noEmit": true, "jsx": "preserve", "baseUrl": ".", "paths": { "@/*": ["./src/*"] } }, "include": ["src/**/*"] }
EOF

cat > src/components/search/CountryPicker.tsx <<'EOF'
'use client'
import { useState } from 'react'

export default function CountryPicker() {
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <label htmlFor="q">Filter</label>
      <input id="q" type="text" />
      <div role="combobox" aria-expanded={expanded} tabIndex={0}>
        <span>{expanded ? 'Pick a country' : 'Choose'}</span>
      </div>
    </div>
  )
}
EOF
echo "scaffolded a11y-holdout-combobox-noname"
