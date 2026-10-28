#!/usr/bin/env bash
# Builds the Nuxt verification app, starts it with the mock backend, fires 40 concurrent
# SSR requests from 20 different sessions and reports responses containing another user's data.
# Ports: set MOCK_PORT and APP_PORT to fixed values, or leave unset to pick free ports
# (the defaults 8000/3000 are often taken by other local servers).
set -e
cd "$(dirname "$0")/../nuxt"
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'; }
MOCK_PORT="${MOCK_PORT:-$(free_port)}"
APP_PORT="${APP_PORT:-$(free_port)}"
export MOCK_PORT APP_PORT
npx nuxt build > /tmp/nuxt-build.log 2>&1
python3 ../ssr-test/mock-backend.py & MOCK=$!
PORT="$APP_PORT" NUXT_API_BASE_SERVER="http://127.0.0.1:${MOCK_PORT}/api/v1" node .output/server/index.mjs > /tmp/nuxt.log 2>&1 & APP=$!
trap 'kill $MOCK $APP 2>/dev/null' EXIT
for _ in $(seq 1 40); do
  if python3 -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:${APP_PORT}/', timeout=2)" 2>/dev/null; then break; fi
  sleep 0.5
done
echo "mock backend on :${MOCK_PORT}, nuxt on :${APP_PORT}"
python3 ../ssr-test/concurrency.py
