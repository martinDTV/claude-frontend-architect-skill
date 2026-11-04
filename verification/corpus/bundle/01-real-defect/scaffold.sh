#!/usr/bin/env bash
# bundle / route-attribution real-defect: a single route "/app" whose initial client set contains a genuinely heavy
# chunk. We copy the committed, git-tracked Next build fixture (so route-attribution finds a real .next and does not
# exit 2 "no production build found"), then REPLACE it with exactly one route whose largest initial chunk is ~227 KB
# gzip. The route-reference manifest marks that chunk async:false (part of the initial set), so route-attribution's
# route-heavy-initial-chunk heuristic (fires when the largest initial chunk gzip >= 150 KB) MUST fire on /app.
#
# Deterministic sizing: chunk bytes come from a base64-encoded AES-CTR keystream (fixed passphrase), which is
# high-entropy and reproducible, so the gzip size is stable run to run (~0.757 of raw). 300000 raw -> ~227 KB gzip.
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$ROOT" ]; then echo "cannot resolve repo root (run inside the repository)" >&2; exit 1; fi
FIX="$ROOT/verification/tools/fixtures/route-next-app"

# deterministic, reproducible, high-entropy chunk body of exactly $1 bytes. head closes the pipe early (SIGPIPE),
# which under `pipefail` would look like a failure, so this generator runs with pipefail off in its own subshell.
gen() { ( set +o pipefail; openssl enc -aes-256-ctr -pass "pass:bundle-corpus-$2" -nosalt -in /dev/zero 2>/dev/null | base64 | head -c "$1" ); }

cp -R "$FIX/.next" .next
cat > package.json <<'EOF'
{ "name": "bundle-real-defect", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF

# wipe the fixture's routes and chunks; build a single clean route /app
rm -rf .next/server/app .next/static/chunks
mkdir -p .next/server/app/app .next/static/chunks

# chunks: a small page chunk + a HEAVY vendor chunk (300000 raw -> ~227 KB gzip), both in the INITIAL set (async:false)
gen 8000   page    > .next/static/chunks/page-app.js
gen 300000 heavyv  > .next/static/chunks/heavy-vendor.js
gen 20000  base    > .next/static/chunks/base1.js

cat > .next/server/app/app/page_client-reference-manifest.js <<'EOF'
globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/app/page"] = {"moduleLoading":{"prefix":""},"clientModules":{"[project]/src/app.tsx":{"id":1,"name":"*","chunks":["static/chunks/page-app.js","static/chunks/heavy-vendor.js"],"async":false}},"entryCSSFiles":{"x":[]},"entryJSFiles":{"[project]/src/app/layout":["static/chunks/base1.js"]}};
EOF

cat > .next/prerender-manifest.json <<'EOF'
{"version":4,"routes":{"/app":{"routeType":"page","compute":"static","htmlSize":5000,"initialRevalidateSeconds":false,"srcRoute":"/app","dataRoute":"/app.rsc"}},"dynamicRoutes":{},"notFoundRoutes":[],"preview":{"previewModeId":"x"}}
EOF
cat > .next/routes-manifest.json <<'EOF'
{"version":3,"basePath":"","staticRoutes":[{"page":"/app"}],"dynamicRoutes":[],"dataRoutes":[],"redirects":[],"rewrites":[],"headers":[]}
EOF
cat > .next/app-path-routes-manifest.json <<'EOF'
{"/app/page":"/app"}
EOF
echo "scaffolded bundle-real-defect"
