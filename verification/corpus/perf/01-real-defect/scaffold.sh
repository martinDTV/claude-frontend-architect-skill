#!/usr/bin/env bash
# React/Next (App Router) invoice screen with THREE genuine performance defects a human reviewer
# recognises at a glance, all on a 'use client' component that renders on the initial route:
#   DEFECT A: `import { jsPDF } from 'jspdf'`  — a PDF library (heavy document runtime) pulled eagerly
#             into the startup bundle, although the PDF is only generated when the user clicks "Export".
#   DEFECT B: `import { EditorContent } from '@tiptap/react'` — a rich-text editor runtime, also static
#             and client-reachable, even though the notes editor is below the fold.
#   DEFECT C: a list rendered with `key={crypto.randomUUID()}` — a FRESH value on every render, so every
#             row remounts each render (the canonical unstable-key bug).
# None of these is regex bait: both imports are genuinely static value imports in a client file, and the
# randomUUID key is the textbook mistake. Scenario is deliberately different from increment-2 evals
# 105-107 (which used three/React, chart.js/Vue, moment): different libraries, a randomUUID key (not
# Math.random), and two heavy imports rather than one. No installs, no network.
set -euo pipefail
mkdir -p src/app src/components

cat > package.json <<'EOF'
{ "name": "perf-invoice-app", "private": true, "dependencies": { "next": "16.4.0", "react": "19.3.0", "react-dom": "19.3.0", "jspdf": "2.5.2", "@tiptap/react": "2.6.0" } }
EOF

cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next'
const config: NextConfig = { reactStrictMode: true }
export default config
EOF

cat > src/app/page.tsx <<'EOF'
import { InvoiceScreen } from '../components/InvoiceScreen'
export default function Home() {
  const lines = [{ sku: 'A1', label: 'Widget' }, { sku: 'B2', label: 'Gadget' }, { sku: 'C3', label: 'Gizmo' }]
  return (
    <main>
      <h1>Invoice</h1>
      <InvoiceScreen lines={lines} />
    </main>
  )
}
EOF

# THE DEFECTS live here: a client component on the initial route.
cat > src/components/InvoiceScreen.tsx <<'EOF'
'use client'
import { jsPDF } from 'jspdf'
import { EditorContent } from '@tiptap/react'
import { useState } from 'react'

export function InvoiceScreen({ lines }: { lines: { sku: string; label: string }[] }) {
  const [, setDoc] = useState<unknown>(null)
  const exportPdf = () => setDoc(new jsPDF())
  return (
    <section>
      <ul>
        {lines.map((l) => <li key={crypto.randomUUID()}>{l.label}</li>)}
      </ul>
      <EditorContent editor={null} />
      <button onClick={exportPdf}>Export</button>
    </section>
  )
}
EOF

echo "scaffolded perf-invoice-app"
