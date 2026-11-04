#!/usr/bin/env bash
# BLIND GENERALIZATION hold-out, bundle — the area's WEAK SPOT: a heavy chunk JUST OVER the 150 KB threshold on a
# DIFFERENT route shape than the development set. Development bundle cases used flat routes; here the heavy chunk is in
# the initial set of a NESTED App Router route /settings/billing (manifest key "/settings/billing/page"). The chunk is
# 210000 bytes raw of high-entropy base64, which under gzipSync is ~154.5 KB gzip (kb() rounds to 154.5) -- just over
# the 150 KB cutoff, not a knife-edge under it (the development ambiguous case owns the just-under side). Marked
# async:false, it is the largest initial chunk, so route-heavy-initial-chunk MUST fire on /settings/billing.
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$ROOT" ]; then echo "cannot resolve repo root (run inside the repository)" >&2; exit 1; fi
FIX="$ROOT/verification/tools/fixtures/route-next-app"
gen() { ( set +o pipefail; openssl enc -aes-256-ctr -pass "pass:holdout-bundle-$2" -nosalt -in /dev/zero 2>/dev/null | base64 | head -c "$1" ); }

cp -R "$FIX/.next" .next
cat > package.json <<'EOF'
{ "name": "bundle-holdout-nested-just-over", "private": true, "dependencies": { "next": "16.0.0", "react": "19.0.0", "react-dom": "19.0.0" } }
EOF
cat > next.config.ts <<'EOF'
export default {}
EOF

rm -rf .next/server/app .next/static/chunks
mkdir -p .next/server/app/settings/billing .next/static/chunks

gen 8000   page   > .next/static/chunks/page-billing.js
gen 210000 justov > .next/static/chunks/billing-tables.js
gen 20000  base   > .next/static/chunks/base1.js

cat > .next/server/app/settings/billing/page_client-reference-manifest.js <<'EOF'
globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/settings/billing/page"] = {"moduleLoading":{"prefix":""},"clientModules":{"[project]/src/billing.tsx":{"id":1,"name":"*","chunks":["static/chunks/page-billing.js","static/chunks/billing-tables.js"],"async":false}},"entryCSSFiles":{"x":[]},"entryJSFiles":{"[project]/src/app/layout":["static/chunks/base1.js"]}};
EOF

cat > .next/prerender-manifest.json <<'EOF'
{"version":4,"routes":{"/settings/billing":{"routeType":"page","compute":"static","htmlSize":4000,"initialRevalidateSeconds":false,"srcRoute":"/settings/billing","dataRoute":"/settings/billing.rsc"}},"dynamicRoutes":{},"notFoundRoutes":[],"preview":{"previewModeId":"x"}}
EOF
cat > .next/routes-manifest.json <<'EOF'
{"version":3,"basePath":"","staticRoutes":[{"page":"/settings/billing"}],"dynamicRoutes":[],"dataRoutes":[],"redirects":[],"rewrites":[],"headers":[]}
EOF
cat > .next/app-path-routes-manifest.json <<'EOF'
{"/settings/billing/page":"/settings/billing"}
EOF
echo "scaffolded bundle-holdout-nested-just-over"
