#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/components
cat > package.json <<'PK'
{ "name": "holdout-perf-a01", "private": true, "dependencies": { "next": "16.0.0", "echarts": "5.5.0" } }
PK
cat > next.config.ts <<'NC'
export default {}
NC
# Known-limit reproduction (perf FN): a heavy module pulled into the initial bundle via a BARE side-effect
# import (kind 'side-effect'), which perf-audit's heavy-static-import does not iterate. Different carrier
# from the dev case's re-export (export ... from).
cat > src/components/Dashboard.tsx <<'TSX'
'use client'
import 'echarts/dist/echarts.min.js'
export function Dashboard() {
  return <div id="chart" />
}
TSX
echo scaffolded
