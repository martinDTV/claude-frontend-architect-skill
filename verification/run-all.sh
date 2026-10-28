#!/usr/bin/env bash
# Runs every verification of the documented code. Used by CI and by contributors.
# Requires: Node 22+, pnpm 10 (for Nuxt), python3 (mock backend), nginx (optional).
set -euo pipefail
cd "$(dirname "$0")"
node plugin-check.mjs
node --test tools/*.test.mjs
node extract.mjs
(cd vue && npx tsc --noEmit && npx vitest run)
(cd react && npx tsc --noEmit)
(cd creative && npx tsc --noEmit && npx vitest run)
(cd next && npx tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 npx next build)
(cd nuxt && npx nuxt prepare && node check-layers.mjs && npx nuxt typecheck)
./ssr-test/run.sh
./ssr-test/run.sh --negative
(cd depcruise && ../vue/node_modules/.bin/depcruise src --config .dependency-cruiser.cjs > /tmp/depcruise.txt 2>&1 || true; grep -q "2 dependency violations" /tmp/depcruise.txt)
if command -v nginx >/dev/null; then ./nginx-test.sh; fi
echo "All verifications passed."
