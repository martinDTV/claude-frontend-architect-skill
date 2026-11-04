#!/usr/bin/env bash
# bundle / route-attribution correct-suspicious (trap): a route "/editor" that references a GENUINELY large chunk
# (~222 KB gzip) but marks it async:true in its client-reference manifest — i.e. it is code-split / lazily loaded, NOT
# part of the initial set. route-attribution excludes async:true modules from the initial set (see nextRouteChunks:
# "async:true modules are referenced for lazy loading, not part of the route's initial client set"). The large chunk
# is a decoy: a correct auditor must NOT fire route-heavy-initial-chunk here, because the heavy code is deferred. The
# route's initial set is only a small page chunk + a small base chunk.
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$ROOT" ]; then echo "cannot resolve repo root (run inside the repository)" >&2; exit 1; fi
FIX="$ROOT/verification/tools/fixtures/route-next-app"
gen() { ( set +o pipefail; openssl enc -aes-256-ctr -pass "pass:bundle-corpus-$2" -nosalt -in /dev/zero 2>/dev/null | base64 | head -c "$1" ); }

cp -R "$FIX/.next" .next
cat > package.json <<'EOF'
{ "name": "bundle-correct-suspicious", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF

rm -rf .next/server/app .next/static/chunks
mkdir -p .next/server/app/editor .next/static/chunks

# the lazy editor bundle is large (~222 KB gzip) but deferred; initial set stays small
gen 8000   page   > .next/static/chunks/page-editor.js
gen 300000 editor > .next/static/chunks/lazy-editor.js
gen 20000  base   > .next/static/chunks/base1.js

# lazy-editor module is async:true -> excluded from the initial set; page module is async:false -> initial
cat > .next/server/app/editor/page_client-reference-manifest.js <<'EOF'
globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/editor/page"] = {"moduleLoading":{"prefix":""},"clientModules":{"[project]/src/editor.tsx":{"id":1,"name":"*","chunks":["static/chunks/page-editor.js"],"async":false},"[project]/src/heavy-editor.tsx":{"id":2,"name":"*","chunks":["static/chunks/lazy-editor.js"],"async":true}},"entryCSSFiles":{"x":[]},"entryJSFiles":{"[project]/src/app/layout":["static/chunks/base1.js"]}};
EOF

cat > .next/prerender-manifest.json <<'EOF'
{"version":4,"routes":{"/editor":{"routeType":"page","compute":"static","htmlSize":4000,"initialRevalidateSeconds":false,"srcRoute":"/editor","dataRoute":"/editor.rsc"}},"dynamicRoutes":{},"notFoundRoutes":[],"preview":{"previewModeId":"x"}}
EOF
cat > .next/routes-manifest.json <<'EOF'
{"version":3,"basePath":"","staticRoutes":[{"page":"/editor"}],"dynamicRoutes":[],"dataRoutes":[],"redirects":[],"rewrites":[],"headers":[]}
EOF
cat > .next/app-path-routes-manifest.json <<'EOF'
{"/editor/page":"/editor"}
EOF
echo "scaffolded bundle-correct-suspicious"
