#!/usr/bin/env bash
# Prepares a BUILT Next.js app for per-route bundle attribution. route-attribution reads a production
# build (.next); without one it exits 2 "no production build found", so a deterministic offline positive
# is only possible by shipping a real build. Rather than attempt an offline `next build` (network + a
# version-fragile artifact), this copies the committed, git-tracked fixture build at
# verification/tools/fixtures/route-next-app (sources + a hand-made .next with routes-manifest,
# app-path-routes-manifest, prerender-manifest and per-route client-reference manifests).
#
# Planted, verified state: the /heavy route has a 226.5 KB gzip chunk (heavy-vendor.js) in its initial
# set, so route-attribution emits route-heavy-initial-chunk (heuristic, medium) for /heavy and the
# route-attribution (info) line for every attributed route. /light, /shared-a and /shared-b stay under
# the 150 KB heuristic threshold (no heavy finding), and /blog/[slug] is dynamic with no client-reference
# manifest, so it degrades to route-attribution-unavailable (info). The heavy chunk is a LEAD, not a
# verdict: a hashed chunk name does not prove what library it is, and build-associated size is not bytes
# transferred or used. No installs, no network, no model.
set -euo pipefail

# Resolve the repo root from THIS script's location (the CLI runs the scaffold from its original path inside the
# plugin, with the eval's working directory elsewhere). Do NOT trust `git rev-parse` first: `claude plugin eval`
# initialises a git repo in the sandbox home, so it answers with the sandbox, not this repository (the first
# real pilot run, 2026-11-13, failed exactly that way: "committed fixture build not found at <sandbox>/home/...").
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

# Copy the fixture (sources + .next build) into the current directory, excluding the fixture-only truth file.
cp -R "${FIXTURE}/." .
rm -f ./expected-attribution.json
echo "scaffolded eval-bundle-positive (copied built Next fixture from ${FIXTURE})"
