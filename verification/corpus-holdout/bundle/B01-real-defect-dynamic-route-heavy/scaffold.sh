#!/usr/bin/env bash
# BLIND GENERALIZATION hold-out, bundle. Real initial-weight defect on a DYNAMIC route shape — the development
# bundle set put every heavy chunk on a FLAT static route (/app, /heavy). Here the heavy chunk is in the initial
# client set of a dynamic App Router route /blog/[slug] (route key "/blog/[slug]/page"), a different route
# carrier. The chunk is deterministically ~227 KB gzip (300000 raw of high-entropy base64 under gzipSync),
# marked async:false in the client-reference manifest, so it is part of the route's INITIAL set and the largest
# single chunk, well over route-attribution's 150 KB cutoff. route-heavy-initial-chunk MUST fire on /blog/[slug].
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$ROOT" ]; then echo "cannot resolve repo root (run inside the repository)" >&2; exit 1; fi
FIX="$ROOT/verification/tools/fixtures/route-next-app"
gen() { ( set +o pipefail; openssl enc -aes-256-ctr -pass "pass:holdout-bundle-$2" -nosalt -in /dev/zero 2>/dev/null | base64 | head -c "$1" ); }

cp -R "$FIX/.next" .next
cat > package.json <<'EOF'
{ "name": "bundle-holdout-dynamic-heavy", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF

rm -rf .next/server/app .next/static/chunks
mkdir -p ".next/server/app/blog/[slug]" .next/static/chunks

gen 8000   page    > .next/static/chunks/page-blog.js
gen 300000 heavyv  > .next/static/chunks/vendor-charting.js
gen 20000  base    > .next/static/chunks/base1.js

cat > ".next/server/app/blog/[slug]/page_client-reference-manifest.js" <<'EOF'
globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/blog/[slug]/page"] = {"moduleLoading":{"prefix":""},"clientModules":{"[project]/src/blog.tsx":{"id":1,"name":"*","chunks":["static/chunks/page-blog.js","static/chunks/vendor-charting.js"],"async":false}},"entryCSSFiles":{"x":[]},"entryJSFiles":{"[project]/src/app/layout":["static/chunks/base1.js"]}};
EOF

cat > .next/prerender-manifest.json <<'EOF'
{"version":4,"routes":{},"dynamicRoutes":{"/blog/[slug]":{"routeRegex":"^/blog/([^/]+?)(?:/)?$","dataRoute":"/blog/[slug].rsc","fallback":null,"dataRouteRegex":"^/blog/([^/]+?)\\.rsc$"}},"notFoundRoutes":[],"preview":{"previewModeId":"x"}}
EOF
cat > .next/routes-manifest.json <<'EOF'
{"version":3,"basePath":"","staticRoutes":[],"dynamicRoutes":[{"page":"/blog/[slug]","regex":"^/blog/([^/]+?)(?:/)?$"}],"dataRoutes":[],"redirects":[],"rewrites":[],"headers":[]}
EOF
cat > .next/app-path-routes-manifest.json <<'EOF'
{"/blog/[slug]/page":"/blog/[slug]"}
EOF
echo "scaffolded bundle-holdout-dynamic-heavy"
