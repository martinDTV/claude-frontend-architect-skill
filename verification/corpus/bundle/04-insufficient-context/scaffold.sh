#!/usr/bin/env bash
# bundle / route-attribution insufficient-context: a route "/orphan" that the build lists in routes-manifest (and
# prerender-manifest) but for which NO page_client-reference-manifest.js exists. route-attribution cannot attribute any
# chunk set to it and reports route-attribution-unavailable [info] with a reason — which is HONEST, not a defect: the
# build artifact simply does not expose this route's client chunks (a pure Server Component route, or a Turbopack build
# that emits no app-build-manifest). A correct auditor must raise NO defect-level finding here; it may (and does) emit
# the info-level unavailable note. The initial-weight defect signal (route-heavy-initial-chunk) cannot and must not fire.
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$ROOT" ]; then echo "cannot resolve repo root (run inside the repository)" >&2; exit 1; fi
FIX="$ROOT/verification/tools/fixtures/route-next-app"

cp -R "$FIX/.next" .next
cat > package.json <<'EOF'
{ "name": "bundle-insufficient-context", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF

# wipe all client-reference manifests and chunks: the route is known from routes-manifest only, with no attribution source
rm -rf .next/server/app .next/static/chunks
mkdir -p .next/server/app .next/static/chunks

cat > .next/prerender-manifest.json <<'EOF'
{"version":4,"routes":{},"dynamicRoutes":{},"notFoundRoutes":[],"preview":{"previewModeId":"x"}}
EOF
cat > .next/routes-manifest.json <<'EOF'
{"version":3,"basePath":"","staticRoutes":[{"page":"/orphan"}],"dynamicRoutes":[],"dataRoutes":[],"redirects":[],"rewrites":[],"headers":[]}
EOF
cat > .next/app-path-routes-manifest.json <<'EOF'
{"/orphan/page":"/orphan"}
EOF
echo "scaffolded bundle-insufficient-context"
