#!/usr/bin/env bash
# Builds the Nuxt verification app, starts it with the mock backend, fires 40 concurrent
# SSR requests from 20 different sessions and reports responses containing another user's data.
set -e
cd "$(dirname "$0")/../nuxt"
npx nuxt build > /tmp/nuxt-build.log 2>&1
python3 ../ssr-test/mock-backend.py & MOCK=$!
PORT=3000 NUXT_API_BASE_SERVER=http://127.0.0.1:8000/api/v1 node .output/server/index.mjs > /tmp/nuxt.log 2>&1 & APP=$!
trap 'kill $MOCK $APP 2>/dev/null' EXIT
sleep 4
python3 ../ssr-test/concurrency.py
