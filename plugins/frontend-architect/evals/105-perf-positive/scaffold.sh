#!/usr/bin/env bash
# Creates a small, realistic Next.js (App Router) app with TWO genuine performance defects a human
# reviewer recognises at a glance, on a client component that renders on the initial route:
#   - a top-level `import * as THREE from 'three'` (a 3D engine, one of the largest client deps) pulled
#     eagerly into the startup bundle of the home page, even though the 3D scene is below the fold;
#   - a list rendered with key={Math.random()}, so every item remounts on every render.
# These are NOT regex bait: the THREE import is genuinely static and client-reachable, and the random
# key is the canonical "keys must be stable" mistake. No installs, no network.
set -euo pipefail
mkdir -p src/app src/components

cat > package.json <<'EOF'
{ "name": "perf-positive-app", "private": true, "dependencies": { "next": "16.4.0", "react": "19.3.0", "react-dom": "19.3.0", "three": "0.186.1" } }
EOF

cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next'
const config: NextConfig = { reactStrictMode: true }
export default config
EOF

# The home route renders the heavy client widget eagerly.
cat > src/app/page.tsx <<'EOF'
import { SceneHero } from '../components/SceneHero'
export default function Home() {
  const products = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }]
  return (
    <main>
      <h1>Storefront</h1>
      <SceneHero products={products} />
    </main>
  )
}
EOF

# THE DEFECTS live here: a client component on the initial route.
cat > src/components/SceneHero.tsx <<'EOF'
'use client'
import * as THREE from 'three'
import { useState } from 'react'
export function SceneHero({ products }: { products: { id: string; name: string }[] }) {
  const [scene] = useState(() => new THREE.Scene())
  return (
    <section>
      <ul>
        {products.map((p) => <li key={Math.random()}>{p.name}</li>)}
      </ul>
      <canvas data-scene={scene.uuid} />
    </section>
  )
}
EOF

echo "scaffolded perf-positive-app"
