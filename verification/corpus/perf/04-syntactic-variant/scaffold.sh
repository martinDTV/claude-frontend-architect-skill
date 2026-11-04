#!/usr/bin/env bash
# React/Next app that imports THE SAME heavy module (highcharts) three syntactically different ways, each
# of which ships the highcharts runtime to the client bundle exactly the same:
#   VARIANT 1 (default import):   `import Highcharts from 'highcharts'`           in chart-default.tsx
#   VARIANT 2 (namespace import): `import * as Highcharts from 'highcharts'`      in chart-namespace.tsx
#   VARIANT 3 (re-export):        `export { default as Highcharts } from 'highcharts'` in chart-reexport.tsx
# All three are client-reachable (imported by the home page's client component) and all three pull the full
# highcharts runtime into the startup bundle. A correct auditor, reasoning about what reaches the bundle,
# should flag ALL THREE as the same heavy-static-import. This case exists to test whether the tool's
# detector generalises across import syntaxes. Different from increment-2 evals (single import form). No
# installs, no network.
set -euo pipefail
mkdir -p src/app src/components

cat > package.json <<'EOF'
{ "name": "perf-variant-app", "private": true, "dependencies": { "next": "16.4.0", "react": "19.3.0", "react-dom": "19.3.0", "highcharts": "11.4.0" } }
EOF

cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next'
const config: NextConfig = { reactStrictMode: true }
export default config
EOF

cat > src/app/page.tsx <<'EOF'
import { Charts } from '../components/Charts'
export default function Home() {
  return <main><h1>Charts</h1><Charts /></main>
}
EOF

# A client component that pulls in all three variants, so each is reachable from the initial route.
cat > src/components/Charts.tsx <<'EOF'
'use client'
import { Default } from './chart-default'
import { Namespace } from './chart-namespace'
import { ReExported } from './chart-reexport'
export function Charts() {
  return <div><Default /><Namespace /><ReExported /></div>
}
EOF

# VARIANT 1: a default import of the heavy module.
cat > src/components/chart-default.tsx <<'EOF'
'use client'
import Highcharts from 'highcharts'
export function Default() {
  return <div data-v={Highcharts.version} />
}
EOF

# VARIANT 2: a namespace import of the same heavy module.
cat > src/components/chart-namespace.tsx <<'EOF'
'use client'
import * as Highcharts from 'highcharts'
export function Namespace() {
  return <div data-v={Highcharts.version} />
}
EOF

# VARIANT 3: a RE-EXPORT of the same heavy module. This still bundles highcharts wherever ReExported is
# imported, so it is the same bundle cost as the other two.
cat > src/components/chart-reexport.tsx <<'EOF'
'use client'
export { default as Highcharts } from 'highcharts'
export function ReExported() {
  return <div />
}
EOF

echo "scaffolded perf-variant-app"
