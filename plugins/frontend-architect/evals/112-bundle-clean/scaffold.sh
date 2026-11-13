#!/usr/bin/env bash
# Prepares a BUILT Next.js app where per-route bundle attribution is AVAILABLE and NO route trips the
# heavy-initial-chunk heuristic (the negative control for bundle attribution). route-attribution needs a
# production build; without one it exits 2. This copies the committed route-next-app fixture and then
# removes the /heavy route and its oversized chunk, leaving /light (31 KB gzip), /shared-a and /shared-b
# (62 KB each) — all well under the 150 KB heuristic threshold — plus the dynamic /blog/[slug] route that
# has no client-reference manifest (reported as route-attribution-unavailable, info, not a defect).
#
# Verified state after trim: route-attribution emits only route-attribution (info) for /light, /shared-a
# and /shared-b, route-attribution-unavailable (info) for /blog/[slug], NO route-heavy-initial-chunk and
# NO confirmed finding; exit 0. The point of the control: the agent must report a clean attribution and
# NOT manufacture a heavy-chunk problem to look thorough. No installs, no network, no model.
set -euo pipefail

# Resolve the repo root from this script's own location first: `claude plugin eval` initialises a git repo in the
# sandbox home, so `git rev-parse` there answers with the sandbox, not this repository (see 111-bundle-positive).
d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ "${d}" != "/" ] && [ ! -d "${d}/verification/tools/fixtures/route-next-app" ]; do d="$(dirname "${d}")"; done
REPO_ROOT="${d}"
if [ ! -d "${REPO_ROOT}/verification/tools/fixtures/route-next-app" ]; then
  REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || true)"
fi
FIXTURE="${REPO_ROOT}/verification/tools/fixtures/route-next-app"
if [ ! -d "${FIXTURE}/.next" ]; then
  echo "ERROR: committed fixture build not found at ${FIXTURE}/.next" >&2
  exit 1
fi

cp -R "${FIXTURE}/." .
rm -f ./expected-attribution.json

# Remove the /heavy route and its heavy chunk so no route exceeds the heavy-chunk threshold.
rm -rf .next/server/app/heavy src/app/heavy
rm -f .next/static/chunks/page-heavy.js .next/static/chunks/heavy-vendor.js .next/static/chunks/lazy-heavy.js

# Drop /heavy from the three manifests route-attribution reads.
node -e 'const fs=require("fs");const p=".next/routes-manifest.json";const m=JSON.parse(fs.readFileSync(p));m.staticRoutes=(m.staticRoutes||[]).filter(r=>r.page!=="/heavy");fs.writeFileSync(p,JSON.stringify(m,null,2));'
node -e 'const fs=require("fs");const p=".next/app-path-routes-manifest.json";const m=JSON.parse(fs.readFileSync(p));delete m["/heavy/page"];fs.writeFileSync(p,JSON.stringify(m,null,2));'
node -e 'const fs=require("fs");const p=".next/prerender-manifest.json";const m=JSON.parse(fs.readFileSync(p));if(m.routes)delete m.routes["/heavy"];fs.writeFileSync(p,JSON.stringify(m,null,2));'

echo "scaffolded eval-bundle-clean (built Next fixture with the heavy route trimmed; no route over the heuristic threshold)"
