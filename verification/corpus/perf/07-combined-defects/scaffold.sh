#!/usr/bin/env bash
# React/Next (App Router) document-viewer screen with FOUR distinct, genuine performance defects coexisting
# in one realistic client component on the initial route — the combined-defects case:
#   DEFECT A: `import * as pdfjsLib from 'pdfjs-dist'` — a PDF rendering runtime (heavy) imported
#             statically into the startup bundle (heuristic bundle signal).
#   DEFECT B: a Context Provider given a fresh inline object literal as value on every render
#             (`value={{ theme, user }}`) — new identity each render re-renders every consumer (heuristic).
#   DEFECT C: a list keyed by the array index (`key={i}`) — safe only for a static list, wrong on
#             reorder/insert/delete (heuristic).
#   DEFECT D: a second list keyed by `Date.now()` — a fresh value every render, so every row remounts
#             (confirmed).
# Each is independently recognisable by a reviewer; together they make a realistic "everything at once"
# component. Different libraries/shape from increment-2 evals. No installs, no network.
set -euo pipefail
mkdir -p src/app src/components

cat > package.json <<'EOF'
{ "name": "perf-combined-app", "private": true, "dependencies": { "next": "16.4.0", "react": "19.3.0", "react-dom": "19.3.0", "pdfjs-dist": "4.4.168" } }
EOF

cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next'
const config: NextConfig = { reactStrictMode: true }
export default config
EOF

cat > src/app/page.tsx <<'EOF'
import { DocViewer } from '../components/DocViewer'
export default function Home() {
  const pages = [{ id: 'p1', n: 1 }, { id: 'p2', n: 2 }]
  const notes = [{ id: 'n1', t: 'a' }, { id: 'n2', t: 'b' }]
  return <main><h1>Document</h1><DocViewer pages={pages} notes={notes} /></main>
}
EOF

# All four defects live here, in a single client component rendered on the initial route.
cat > src/components/DocViewer.tsx <<'EOF'
'use client'
import * as pdfjsLib from 'pdfjs-dist'
import { createContext, useState } from 'react'

const ThemeCtx = createContext<unknown>(null)

export function DocViewer({ pages, notes }: { pages: { id: string; n: number }[]; notes: { id: string; t: string }[] }) {
  const [theme] = useState('light')
  const user = { name: 'Ada' }
  void pdfjsLib
  return (
    <ThemeCtx.Provider value={{ theme, user }}>
      <ul>
        {pages.map((p, i) => <li key={i}>{p.n}</li>)}
      </ul>
      <ol>
        {notes.map((note) => <li key={Date.now()}>{note.t}</li>)}
      </ol>
    </ThemeCtx.Provider>
  )
}
EOF

echo "scaffolded perf-combined-app"
