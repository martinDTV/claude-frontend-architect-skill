#!/usr/bin/env bash
# BLIND GENERALIZATION hold-out, a11y. Next.js (React, .tsx) surface — the development a11y set carried its JSX
# defects inside a Vue defineComponent render function (Nuxt). Here the component is a plain React function
# component in a Next.js App Router app (different framework surface, different file layout under src/components/),
# exercising TWO ui-audit rules the development set never placed in an expected[] set:
#   - a native <dialog> with no aria-label / aria-labelledby   -> dialog-without-name   (confirmed / static)
#   - an element with onMouseEnter but no onFocus handler      -> mouse-only-handler    (heuristic / review)
# Both are read from the markup by hand, before and independent of the tool. The <dialog> truly carries no name
# attribute; the hover row truly has a mouse-enter handler and no focus/focusin handler. Different file/line
# layout from every development case so a line match cannot happen by coincidence.
set -euo pipefail
mkdir -p src/components/panel

cat > package.json <<'EOF'
{ "name": "a11y-holdout-dialog-mouseonly", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022", "strict": true, "noEmit": true, "jsx": "preserve", "baseUrl": ".", "paths": { "@/*": ["./src/*"] } }, "include": ["src/**/*"] }
EOF

cat > src/components/panel/InfoPanel.tsx <<'EOF'
'use client'
import { useState } from 'react'

export default function InfoPanel() {
  const [open, setOpen] = useState(false)
  const preview = () => {}
  return (
    <section>
      <h2>Account</h2>
      <div onMouseEnter={preview}>Hover for a preview</div>
      <button type="button" onClick={() => setOpen(true)}>Details</button>
      <dialog open={open}>
        <p>Your account details.</p>
        <button type="button" onClick={() => setOpen(false)}>Close</button>
      </dialog>
    </section>
  )
}
EOF
echo "scaffolded a11y-holdout-dialog-mouseonly"
