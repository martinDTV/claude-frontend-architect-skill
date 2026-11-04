#!/usr/bin/env bash
# GENERALIZATION (set B). React/Next client component with three performance patterns on carriers the
# development corpus does not use for these ids:
#   DEFECT A (heavy-static-import, heuristic): `import * as monaco from 'monaco-editor'` — an editor
#             runtime pulled in as a STATIC value import in a 'use client' component on the initial route.
#   DEFECT B (provider-inline-value, heuristic): a Context Provider whose value is a fresh FUNCTION literal
#             each render (value={() => ...}); dev corpus used an object literal, this is the callback form.
#   DEFECT C (list-key-unstable, confirmed): a list keyed by Date.now() (a fresh value every render);
#             dev corpus used crypto.randomUUID()/Math.random(), this is the Date.now() form.
# React Compiler is NOT enabled, so provider-inline-value stays at heuristic (not downgraded to info).
set -euo pipefail
mkdir -p src/app src/components

cat > package.json <<'EOF'
{ "name": "holdout-perf-monaco", "private": true, "dependencies": { "next": "16.4.0", "react": "19.3.0", "react-dom": "19.3.0", "monaco-editor": "0.52.0" } }
EOF

cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "jsx": "preserve", "strict": true, "skipLibCheck": true } }
EOF

cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next'
const config: NextConfig = { reactStrictMode: true }
export default config
EOF

cat > src/app/page.tsx <<'EOF'
import { EditorPanel } from '../components/EditorPanel'
export default function Home() {
  return <main><EditorPanel /></main>
}
EOF

# THE DEFECTS live here, on the initial route's client component.
cat > src/components/EditorPanel.tsx <<'EOF'
'use client'
import * as monaco from 'monaco-editor'
import { createContext, useState } from 'react'

const ToolbarContext = createContext<{ run: () => void } | null>(null)

export function EditorPanel() {
  const [files] = useState([{ name: 'a.ts' }, { name: 'b.ts' }])
  return (
    <ToolbarContext.Provider value={() => monaco.editor.getModels()}>
      <ul>
        {files.map((f) => <li key={Date.now()}>{f.name}</li>)}
      </ul>
    </ToolbarContext.Provider>
  )
}
EOF

echo "scaffolded holdout-perf-monaco"
