#!/usr/bin/env bash
# bundle / route-attribution combined: one realistic build with three routes exercising the auditor at once —
#   /heavy  : a ~222 KB gzip chunk in the INITIAL set (async:false)        -> route-heavy-initial-chunk MUST fire (TP)
#   /editor : a ~222 KB gzip chunk that is LAZY (async:true), initial small -> must NOT fire (trap / FP guard)
#   /orphan : listed in routes-manifest, NO client-reference manifest       -> route-attribution-unavailable [info] only
# This checks the tool isolates the real initial-weight defect from a correctly code-split large chunk and from a route
# whose attribution is simply unavailable, in a single pass.
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$ROOT" ]; then echo "cannot resolve repo root (run inside the repository)" >&2; exit 1; fi
FIX="$ROOT/verification/tools/fixtures/route-next-app"
gen() { ( set +o pipefail; openssl enc -aes-256-ctr -pass "pass:bundle-corpus-$2" -nosalt -in /dev/zero 2>/dev/null | base64 | head -c "$1" ); }

cp -R "$FIX/.next" .next
cat > package.json <<'EOF'
{ "name": "bundle-combined", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF

rm -rf .next/server/app .next/static/chunks
mkdir -p .next/server/app/heavy .next/server/app/editor .next/static/chunks

gen 20000  base    > .next/static/chunks/base1.js
# /heavy initial-heavy chunk
gen 8000   ph      > .next/static/chunks/page-heavy.js
gen 300000 hv      > .next/static/chunks/heavy-vendor.js
# /editor lazy-heavy chunk (deferred, must be excluded)
gen 8000   pe      > .next/static/chunks/page-editor.js
gen 300000 le      > .next/static/chunks/lazy-editor.js

cat > .next/server/app/heavy/page_client-reference-manifest.js <<'EOF'
globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/heavy/page"] = {"moduleLoading":{"prefix":""},"clientModules":{"[project]/src/heavy.tsx":{"id":1,"name":"*","chunks":["static/chunks/page-heavy.js","static/chunks/heavy-vendor.js"],"async":false}},"entryCSSFiles":{"x":[]},"entryJSFiles":{"[project]/src/app/layout":["static/chunks/base1.js"]}};
EOF
cat > .next/server/app/editor/page_client-reference-manifest.js <<'EOF'
globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/editor/page"] = {"moduleLoading":{"prefix":""},"clientModules":{"[project]/src/editor.tsx":{"id":2,"name":"*","chunks":["static/chunks/page-editor.js"],"async":false},"[project]/src/heavy-editor.tsx":{"id":3,"name":"*","chunks":["static/chunks/lazy-editor.js"],"async":true}},"entryCSSFiles":{"x":[]},"entryJSFiles":{"[project]/src/app/layout":["static/chunks/base1.js"]}};
EOF

cat > .next/prerender-manifest.json <<'EOF'
{"version":4,"routes":{"/heavy":{"routeType":"page","compute":"static","htmlSize":5000,"initialRevalidateSeconds":false,"srcRoute":"/heavy","dataRoute":"/heavy.rsc"},"/editor":{"routeType":"page","compute":"static","htmlSize":4000,"initialRevalidateSeconds":false,"srcRoute":"/editor","dataRoute":"/editor.rsc"}},"dynamicRoutes":{},"notFoundRoutes":[],"preview":{"previewModeId":"x"}}
EOF
cat > .next/routes-manifest.json <<'EOF'
{"version":3,"basePath":"","staticRoutes":[{"page":"/heavy"},{"page":"/editor"},{"page":"/orphan"}],"dynamicRoutes":[],"dataRoutes":[],"redirects":[],"rewrites":[],"headers":[]}
EOF
cat > .next/app-path-routes-manifest.json <<'EOF'
{"/heavy/page":"/heavy","/editor/page":"/editor","/orphan/page":"/orphan"}
EOF
echo "scaffolded bundle-combined"
