#!/usr/bin/env bash
# bundle / route-attribution negative-control: a clean build where every route's initial set is light — the largest
# single initial chunk on any route is ~68 KB gzip (90000 raw), far below the 150 KB cutoff. Nothing is lazy, nothing is
# missing; all three routes attribute cleanly with build-manifest confidence. A correct auditor fires NO defect-level
# finding anywhere (only route-attribution [info] per route). This is the TN baseline: the tool must stay quiet on a
# genuinely well-split app.
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$ROOT" ]; then echo "cannot resolve repo root (run inside the repository)" >&2; exit 1; fi
FIX="$ROOT/verification/tools/fixtures/route-next-app"
gen() { ( set +o pipefail; openssl enc -aes-256-ctr -pass "pass:bundle-corpus-$2" -nosalt -in /dev/zero 2>/dev/null | base64 | head -c "$1" ); }

cp -R "$FIX/.next" .next
cat > package.json <<'EOF'
{ "name": "bundle-negative-control", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF

rm -rf .next/server/app .next/static/chunks
mkdir -p .next/server/app/home .next/server/app/about .next/server/app/pricing .next/static/chunks

gen 20000 base > .next/static/chunks/base1.js
gen 15000 base2 > .next/static/chunks/base2.js
# per-route page chunks, all comfortably under threshold (largest single ~68 KB gzip)
gen 90000 home    > .next/static/chunks/page-home.js
gen 50000 about   > .next/static/chunks/page-about.js
gen 70000 pricing > .next/static/chunks/page-pricing.js

for r in home about pricing; do
cat > .next/server/app/$r/page_client-reference-manifest.js <<EOF
globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/$r/page"] = {"moduleLoading":{"prefix":""},"clientModules":{"[project]/src/$r.tsx":{"id":1,"name":"*","chunks":["static/chunks/page-$r.js"],"async":false}},"entryCSSFiles":{"x":[]},"entryJSFiles":{"[project]/src/app/layout":["static/chunks/base1.js","static/chunks/base2.js"]}};
EOF
done

cat > .next/prerender-manifest.json <<'EOF'
{"version":4,"routes":{"/home":{"routeType":"page","compute":"static","htmlSize":3000,"initialRevalidateSeconds":false,"srcRoute":"/home","dataRoute":"/home.rsc"},"/about":{"routeType":"page","compute":"static","htmlSize":3000,"initialRevalidateSeconds":false,"srcRoute":"/about","dataRoute":"/about.rsc"},"/pricing":{"routeType":"page","compute":"static","htmlSize":3000,"initialRevalidateSeconds":false,"srcRoute":"/pricing","dataRoute":"/pricing.rsc"}},"dynamicRoutes":{},"notFoundRoutes":[],"preview":{"previewModeId":"x"}}
EOF
cat > .next/routes-manifest.json <<'EOF'
{"version":3,"basePath":"","staticRoutes":[{"page":"/home"},{"page":"/about"},{"page":"/pricing"}],"dynamicRoutes":[],"dataRoutes":[],"redirects":[],"rewrites":[],"headers":[]}
EOF
cat > .next/app-path-routes-manifest.json <<'EOF'
{"/home/page":"/home","/about/page":"/about","/pricing/page":"/pricing"}
EOF
echo "scaffolded bundle-negative-control"
