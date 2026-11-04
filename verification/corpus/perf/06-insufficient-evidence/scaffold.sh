#!/usr/bin/env bash
# React/Next app whose only "heavy" signal is UNKNOWABLE from the source, so the honest result is
# abstention. The chart component picks its renderer at runtime: `await import(rendererFor(kind))`, where
# rendererFor returns either 'echarts' (heavy) or './light-sparkline' (a tiny local module) depending on a
# value only known at runtime. The specifier passed to import() is a COMPUTED, NON-LITERAL value, so:
#   - it is a dynamic import (not static), hence not a static-heavy-import defect by construction; and
#   - even the module identity is undecidable statically (it may never be echarts).
# A correct auditor reports NO heavy-static-import here and does not invent one from the mere presence of
# the string 'echarts' elsewhere in the file. Inventing a finding on this unknowable evidence would be a
# false positive. (A tool MAY legitimately note an unresolved dynamic import at info level; that is not a
# defect-level finding.) No installs, no network.
set -euo pipefail
mkdir -p src/app src/components

cat > package.json <<'EOF'
{ "name": "perf-dynamic-app", "private": true, "dependencies": { "next": "16.4.0", "react": "19.3.0", "react-dom": "19.3.0", "echarts": "5.5.0" } }
EOF

cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next'
const config: NextConfig = { reactStrictMode: true }
export default config
EOF

cat > src/app/page.tsx <<'EOF'
import { AdaptiveChart } from '../components/AdaptiveChart'
export default function Home() {
  return <main><h1>Chart</h1><AdaptiveChart kind="spark" /></main>
}
EOF

# The renderer module is chosen at RUNTIME; the specifier passed to import() is non-literal, so static
# analysis cannot know whether echarts is ever loaded.
cat > src/components/AdaptiveChart.tsx <<'EOF'
'use client'
import { useEffect, useRef } from 'react'
function rendererFor(kind: string): string {
  // returns 'echarts' (heavy) only for the 'rich' kind; otherwise a tiny local module
  return kind === 'rich' ? 'echarts' : './light-sparkline'
}
export function AdaptiveChart({ kind }: { kind: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    import(rendererFor(kind)).then((mod) => {
      if (alive && ref.current) (mod as { render?: (el: HTMLElement) => void }).render?.(ref.current)
    })
    return () => { alive = false }
  }, [kind])
  return <div ref={ref} />
}
EOF

# The light alternative that is loaded for every non-'rich' kind.
cat > src/components/light-sparkline.tsx <<'EOF'
'use client'
export function render(el: HTMLElement) { el.textContent = '—' }
EOF

echo "scaffolded perf-dynamic-app"
