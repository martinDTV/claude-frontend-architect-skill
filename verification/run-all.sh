#!/usr/bin/env bash
# Runs every verification of the documented code. Used by CI and by contributors.
# Requires: Node 22+, pnpm 10 (for Nuxt), python3 (mock backend), nginx (optional).
set -euo pipefail
cd "$(dirname "$0")"
node plugin-check.mjs
# Prepare the documented code into the verification projects before anything reads them. extract.mjs is deterministic,
# idempotent and writes only the gitignored generated dirs; a fresh checkout and a clean CI runner have none of these yet.
node extract.mjs
# The audit-script tests run after the reference apps are both extracted (above) and built (the next/nuxt lines below),
# because a few assert against those built apps (design-consistency over the sources, route-attribution over the build
# manifests). See the "audit scripts" invocation after the builds.
# 1.4: browser mode against the local fixture (Playwright + axe-core pinned in browser/package.json, Chromium via
# `npx playwright install chromium`). FA_REQUIRE_BROWSER=1 (CI) turns a missing browser into a failure instead of a skip.
if [ -d browser/node_modules/playwright ]; then (cd browser && node --test ./*.test.mjs); else
  echo "browser suite skipped: run 'npm ci && npx playwright install chromium' in verification/browser" >&2
  [ "${FA_REQUIRE_BROWSER:-0}" != 1 ] || { echo "FA_REQUIRE_BROWSER=1 but the browser tooling is missing" >&2; exit 1; }
fi
# 1.3: a tool reached through a symbolic link must still analyse; an empty output here means the main guard failed
LINK=$(mktemp -d) && ln -s "$PWD/../plugins/frontend-architect/skills/frontend-architect/scripts" "$LINK/scripts" && node "$LINK/scripts/domain-deps.mjs" tools/fixtures/ts-paths --engine lexical --fail-on none | grep -q '^domain-deps (frontend-architect tools' && rm -rf "$LINK"
node --expose-gc tools/benchmark.mjs > /tmp/fa-benchmark.md && grep -q '| ts-paths | semantic | semantic | 19 | 19 | 0 | 0 | 100% | 100% | 100% |' /tmp/fa-benchmark.md
# 1.5 increment 5, block E: the reference applications carry no literal where their tokens should be (the harness copies,
# the 3D labs that predate the contract, and the library's own copied components are judged as such and left out)
node ../plugins/frontend-architect/skills/frontend-architect/scripts/design-consistency.mjs nuxt --contract design/contracts/atlas-logistics.json --exclude 'harness/**,**/lab/**' > /tmp/fa-consistency-nuxt.txt
node ../plugins/frontend-architect/skills/frontend-architect/scripts/design-consistency.mjs next --contract design/contracts/atlas-logistics.json --exclude 'harness/**,**/lab/**,**/components/ui/**' > /tmp/fa-consistency-next.txt
(cd vue && npx tsc --noEmit && npx vitest run)
(cd react && npx tsc --noEmit)
(cd react && npx vitest run)
(cd creative && npx tsc --noEmit && npx vitest run)
(cd next && npx tsc --noEmit && NEXT_TELEMETRY_DISABLED=1 npx next build && node check-audit.mjs && node check-browser.mjs && node check-motion.mjs && node check-lab.mjs && node check-strict.mjs && node check-design.mjs && node check-saas.mjs && node check-landing.mjs)
(cd nuxt && npx nuxt prepare && node check-layers.mjs && npx nuxt typecheck)
./ssr-test/run.sh
# 1.5: the documented ScrollStory on the positive production build (mount, route change, re-entry, reduced motion, keyboard, 375 px)
(cd nuxt && node check-motion.mjs)
# 1.5 increment 3: the 3D labs and the three reference experiences in Chromium (shaders, particles, product, field, story)
(cd nuxt && node check-lab.mjs)
# 1.5 increment 5: the design contract applied through Nuxt UI (roles, pairs, focus, reduced motion, legibility), the
# enterprise reference application (states, table, actions, form, preferences, keyboard, responsive, browser-audit) and
# the shop (catalogue, variants, bag, themes, browser-audit); the Next line above runs its design, enterprise and landing checks
(cd nuxt && node check-design.mjs && node check-saas.mjs && node check-shop.mjs)
# The audit-script tests: run here, after the reference apps are extracted and the next/nuxt builds exist, so the few
# tests that read the built apps (route-attribution over the build manifests) have their precondition met and run their
# assertions rather than skipping. The ones that need only the extracted sources would already pass; running the whole
# suite once, here, keeps a single invocation with every precondition satisfied.
node --test tools/*.test.mjs
./ssr-test/run.sh --negative
(cd depcruise && ../vue/node_modules/.bin/depcruise src --config .dependency-cruiser.cjs > /tmp/depcruise.txt 2>&1 || true; grep -q "2 dependency violations" /tmp/depcruise.txt)
if command -v nginx >/dev/null; then ./nginx-test.sh; fi
echo "All verifications passed."
