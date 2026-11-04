#!/usr/bin/env bash
set -euo pipefail
mkdir -p app/composables
cat > nuxt.config.ts <<'NC'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01', ssr: true })
NC
cat > package.json <<'PK'
{ "name": "holdout-state-a01", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
PK
# Known-limit reproduction (state FN): a JWT written to localStorage where BOTH the key and the value are
# generic local bindings with no secret word, so a non-dataflow scan sees setItem(k, v) with no signal.
# This faithfully reproduces the dev state/05 limit (there KEY/t were generic) in a different shape (a
# reassigned let key + a renamed plain value binding), NOT via a secret-word value name.
cat > app/composables/useSession.ts <<'TS'
export function useSession() {
  let k = 'session'
  k = 'app:v2:k'
  async function persist(resp: { data: { v: string } }) {
    const v = resp.data.v
    localStorage.setItem(k, v)
  }
  return { persist }
}
TS
echo scaffolded
