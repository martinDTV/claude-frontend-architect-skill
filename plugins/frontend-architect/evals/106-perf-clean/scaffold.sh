#!/usr/bin/env bash
# Creates a small, realistic Next.js (App Router) app with NO performance defect: the same storefront as
# the positive case, done correctly.
#   - the list is keyed by a stable id from the data (not Math.random());
#   - the heavy 3D engine is never a top-level static import: it is code-split with next/dynamic and the
#     component that uses THREE loads it lazily with `await import('three')`, so it stays off the startup
#     bundle.
# perf-audit must find nothing and the model must NOT invent a defect. No installs, no network.
set -euo pipefail
mkdir -p src/app src/components

cat > package.json <<'EOF'
{ "name": "perf-clean-app", "private": true, "dependencies": { "next": "16.4.0", "react": "19.3.0", "react-dom": "19.3.0", "three": "0.186.1" } }
EOF

cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next'
const config: NextConfig = { reactStrictMode: true }
export default config
EOF

cat > src/app/page.tsx <<'EOF'
import { Storefront } from '../components/Storefront'
export default function Home() {
  const products = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }]
  return (
    <main>
      <h1>Storefront</h1>
      <Storefront products={products} />
    </main>
  )
}
EOF

# The 3D engine is code-split with next/dynamic, so it never reaches the startup bundle.
cat > src/components/Storefront.tsx <<'EOF'
'use client'
import dynamic from 'next/dynamic'
const SceneHero = dynamic(() => import('./SceneHero'), { ssr: false })
export function Storefront({ products }: { products: { id: string; name: string }[] }) {
  return (
    <section>
      <ul>
        {products.map((p) => <li key={p.id}>{p.name}</li>)}
      </ul>
      <SceneHero />
    </section>
  )
}
EOF

# This component is already behind next/dynamic AND loads THREE lazily with a dynamic import inside an
# effect, so there is no top-level static heavy import anywhere in the client tree.
cat > src/components/SceneHero.tsx <<'EOF'
'use client'
import { useEffect, useRef } from 'react'
export default function SceneHero() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let disposed = false
    import('three').then((THREE) => {
      if (disposed) return
      const scene = new THREE.Scene()
      if (ref.current) ref.current.dataset.scene = scene.uuid
    })
    return () => { disposed = true }
  }, [])
  return <canvas ref={ref} />
}
EOF

echo "scaffolded perf-clean-app"
