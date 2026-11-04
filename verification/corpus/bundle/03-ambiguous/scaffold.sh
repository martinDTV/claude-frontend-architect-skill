#!/usr/bin/env bash
# bundle / route-attribution ambiguous: a route "/catalog" whose largest INITIAL chunk sits a hair UNDER the 150 KB
# gzip threshold (202500 bytes raw of high-entropy base64 -> ~149.8 KB gzip). This is a knife-edge: the tool's cutoff
# is "largest initial chunk gzip >= 150 KB" and this chunk lands at ~149.8 KB, so the heuristic does NOT fire. A human
# reviewing the build would call this genuinely borderline — essentially at budget — but at THIS exact size the honest
# call matches the tool's: no defect yet. The value of the case is the documented knife-edge (0.2 KB more flips it).
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$ROOT" ]; then echo "cannot resolve repo root (run inside the repository)" >&2; exit 1; fi
FIX="$ROOT/verification/tools/fixtures/route-next-app"
gen() { ( set +o pipefail; openssl enc -aes-256-ctr -pass "pass:bundle-corpus-$2" -nosalt -in /dev/zero 2>/dev/null | base64 | head -c "$1" ); }

cp -R "$FIX/.next" .next
cat > package.json <<'EOF'
{ "name": "bundle-ambiguous", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF

rm -rf .next/server/app .next/static/chunks
mkdir -p .next/server/app/catalog .next/static/chunks

# 202500 raw -> ~149.8 KB gzip: just under the 150 KB cutoff. Also a small page chunk, both in the initial set.
gen 8000   page   > .next/static/chunks/page-catalog.js
gen 202500 near   > .next/static/chunks/near-threshold.js
gen 20000  base   > .next/static/chunks/base1.js

cat > .next/server/app/catalog/page_client-reference-manifest.js <<'EOF'
globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/catalog/page"] = {"moduleLoading":{"prefix":""},"clientModules":{"[project]/src/catalog.tsx":{"id":1,"name":"*","chunks":["static/chunks/page-catalog.js","static/chunks/near-threshold.js"],"async":false}},"entryCSSFiles":{"x":[]},"entryJSFiles":{"[project]/src/app/layout":["static/chunks/base1.js"]}};
EOF

cat > .next/prerender-manifest.json <<'EOF'
{"version":4,"routes":{"/catalog":{"routeType":"page","compute":"static","htmlSize":4000,"initialRevalidateSeconds":false,"srcRoute":"/catalog","dataRoute":"/catalog.rsc"}},"dynamicRoutes":{},"notFoundRoutes":[],"preview":{"previewModeId":"x"}}
EOF
cat > .next/routes-manifest.json <<'EOF'
{"version":3,"basePath":"","staticRoutes":[{"page":"/catalog"}],"dynamicRoutes":[],"dataRoutes":[],"redirects":[],"rewrites":[],"headers":[]}
EOF
cat > .next/app-path-routes-manifest.json <<'EOF'
{"/catalog/page":"/catalog"}
EOF
echo "scaffolded bundle-ambiguous"
