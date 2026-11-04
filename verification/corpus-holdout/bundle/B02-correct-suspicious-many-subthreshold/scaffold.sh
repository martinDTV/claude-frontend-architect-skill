#!/usr/bin/env bash
# BLIND GENERALIZATION hold-out, bundle. Precision trap exercising route-attribution's exact SCOPE on a fresh route
# shape: route-heavy-initial-chunk keys off the single LARGEST initial chunk >= 150 KB gzip, NOT the route's total
# initial JS. The development ambiguous case (dev bundle/03) tested this with ONE chunk a hair under 150 KB. Here a
# flat route /reports has its initial JS spread over TWO medium chunks (130000 raw each -> ~95.6 KB gzip each) plus a
# small page chunk and a base chunk, all async:false. The route's TOTAL initial gzip is ~200 KB (over 150), but the
# LARGEST single chunk is only ~95.6 KB, under the cutoff. A correct auditor must NOT fire route-heavy-initial-chunk:
# firing on total would be a false positive outside the heuristic's stated scope. Different mechanism and route from
# the development knife-edge case.
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$ROOT" ]; then echo "cannot resolve repo root (run inside the repository)" >&2; exit 1; fi
FIX="$ROOT/verification/tools/fixtures/route-next-app"
gen() { ( set +o pipefail; openssl enc -aes-256-ctr -pass "pass:holdout-bundle-$2" -nosalt -in /dev/zero 2>/dev/null | base64 | head -c "$1" ); }

cp -R "$FIX/.next" .next
cat > package.json <<'EOF'
{ "name": "bundle-holdout-many-subthreshold", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF

rm -rf .next/server/app .next/static/chunks
mkdir -p .next/server/app/reports .next/static/chunks

gen 8000   page  > .next/static/chunks/page-reports.js
gen 130000 ch1   > .next/static/chunks/reports-grid.js
gen 130000 ch2   > .next/static/chunks/reports-filters.js
gen 20000  base  > .next/static/chunks/base1.js

# all four chunks are async:false (initial), but the largest single one (~95.6 KB gzip) is under 150 KB
cat > .next/server/app/reports/page_client-reference-manifest.js <<'EOF'
globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/reports/page"] = {"moduleLoading":{"prefix":""},"clientModules":{"[project]/src/reports.tsx":{"id":1,"name":"*","chunks":["static/chunks/page-reports.js","static/chunks/reports-grid.js","static/chunks/reports-filters.js"],"async":false}},"entryCSSFiles":{"x":[]},"entryJSFiles":{"[project]/src/app/layout":["static/chunks/base1.js"]}};
EOF

cat > .next/prerender-manifest.json <<'EOF'
{"version":4,"routes":{"/reports":{"routeType":"page","compute":"static","htmlSize":4000,"initialRevalidateSeconds":false,"srcRoute":"/reports","dataRoute":"/reports.rsc"}},"dynamicRoutes":{},"notFoundRoutes":[],"preview":{"previewModeId":"x"}}
EOF
cat > .next/routes-manifest.json <<'EOF'
{"version":3,"basePath":"","staticRoutes":[{"page":"/reports"}],"dynamicRoutes":[],"dataRoutes":[],"redirects":[],"rewrites":[],"headers":[]}
EOF
cat > .next/app-path-routes-manifest.json <<'EOF'
{"/reports/page":"/reports"}
EOF
echo "scaffolded bundle-holdout-many-subthreshold"
