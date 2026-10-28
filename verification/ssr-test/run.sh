#!/usr/bin/env bash
# SSR isolation test. Builds the Nuxt verification app, starts it with the mock backend and fires
# 40 concurrent SSR requests from 20 sessions over 3 tenants (some deliberately slow); every page
# must contain only its own user+tenant pair.
#   ./run.sh             positive: the documented per-request client must show 0 leaks
#   ./run.sh --negative  negative control: the module-level-client anti-pattern must leak
#                        (proves the test can see the bug); sources are restored afterwards
# Ports: MOCK_PORT and APP_PORT, or free ports when unset (8000/3000 are often taken locally).
set -e
cd "$(dirname "$0")/../nuxt"
MODE=positive
[ "${1:-}" = "--negative" ] && MODE=negative
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'; }
MOCK_PORT="${MOCK_PORT:-$(free_port)}"
APP_PORT="${APP_PORT:-$(free_port)}"
export MOCK_PORT APP_PORT
START=$(date +%s)
if [ "$MODE" = negative ]; then
  cp ../ssr-test/negative/plugins/api.ts app/plugins/api.ts
  echo "ssr-test: negative control (module-level client anti-pattern installed)"
fi
npx nuxt build > /tmp/nuxt-build-$MODE.log 2>&1
python3 ../ssr-test/mock-backend.py & MOCK=$!
PORT="$APP_PORT" NUXT_API_BASE_SERVER="http://127.0.0.1:${MOCK_PORT}/api/v1" node .output/server/index.mjs > /tmp/nuxt-$MODE.log 2>&1 & APP=$!
cleanup() {
  kill $MOCK $APP 2>/dev/null || true
  if [ "$MODE" = negative ]; then
    # restore the documented sources (extract.mjs regenerates app/ from the references)
    (cd .. && node extract.mjs > /dev/null)
    echo "ssr-test: documented plugin restored in app/ (.output still holds the negative build; rerun ./run.sh for a positive build)"
  fi
}
trap cleanup EXIT
for _ in $(seq 1 40); do
  if python3 -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:${APP_PORT}/', timeout=5)" 2>/dev/null; then break; fi
  sleep 0.5
done
echo "mock backend on :${MOCK_PORT}, nuxt on :${APP_PORT} (build $(( $(date +%s) - START )) s)"
if [ "$MODE" = negative ]; then
  EXPECT_LEAKS=1 python3 ../ssr-test/concurrency.py
else
  python3 ../ssr-test/concurrency.py
fi
echo "ssr-test ($MODE) finished in $(( $(date +%s) - START )) s"
