#!/usr/bin/env bash
# Runs every verification of the documented code. Used by CI and by contributors.
# Requires: Node 22+, pnpm 10 (for Nuxt), python3 (mock backend), nginx (optional).
set -euo pipefail
cd "$(dirname "$0")"
node plugin-check.mjs
node --test tools/*.test.mjs
# 1.4: browser mode against the local fixture (Playwright + axe-core pinned in browser/package.json, Chromium via
# `npx playwright install chromium`). FA_REQUIRE_BROWSER=1 (CI) turns a missing browser into a failure instead of a skip.
if [ -d browser/node_modules/playwright ]; then (cd browser && node --test browser-audit.test.mjs); else
  echo "browser suite skipped: run 'npm ci && npx playwright install chromium' in verification/browser" >&2
  [ "${FA_REQUIRE_BROWSER:-0}" != 1 ] || { echo "FA_REQUIRE_BROWSER=1 but the browser tooling is missing" >&2; exit 1; }
fi
# 1.3: a tool reached through a symbolic link must still analyse; an empty output here means the main guard failed
LINK=$(mktemp -d) && ln -s "$PWD/../plugins/frontend-architect/skills/frontend-architect/scripts" "$LINK/scripts" && node "$LINK/scripts/domain-deps.mjs" tools/fixtures/ts-paths --engine lexical --fail-on none | grep -q '^domain-deps (frontend-architect tools' && rm -rf "$LINK"
node --expose-gc tools/benchmark.mjs > /tmp/fa-benchmark.md && grep -q '| ts-paths | semantic | semantic | 19 | 19 | 0 | 0 | 100% | 100% | 100% |' /tmp/fa-benchmark.md
node extract.mjs
(cd vue && npx tsc --noEmit && npx vitest run)
(cd react && npx tsc --noEmit)
(cd creative && npx tsc --noEmit && npx vitest run)
(cd next && npx tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 npx next build && node check-audit.mjs)
(cd nuxt && npx nuxt prepare && node check-layers.mjs && npx nuxt typecheck)
./ssr-test/run.sh
./ssr-test/run.sh --negative
(cd depcruise && ../vue/node_modules/.bin/depcruise src --config .dependency-cruiser.cjs > /tmp/depcruise.txt 2>&1 || true; grep -q "2 dependency violations" /tmp/depcruise.txt)
if command -v nginx >/dev/null; then ./nginx-test.sh; fi
echo "All verifications passed."
