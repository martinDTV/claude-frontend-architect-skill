#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/app/api/billing src/lib
cat > package.json <<'PK'
{ "name": "holdout-routes-a01", "private": true, "dependencies": { "next": "16.0.0" } }
PK
cat > next.config.ts <<'NC'
export default {}
NC
# Known-limit reproduction (routes FP): a route handler that DOES enforce auth, but via an imported
# helper with a name NOT in routes-audit's vocabulary (different from dev's ensureLoggedIn: here guardRequest).
cat > src/lib/guard.ts <<'TS'
import { cookies } from 'next/headers'
export async function guardRequest() {
  const jar = await cookies()
  if (!jar.get('sid')) throw new Error('401')
}
TS
cat > src/app/api/billing/route.ts <<'TS'
import { guardRequest } from '@/lib/guard'
export async function POST(request: Request) {
  await guardRequest()
  const body = await request.json()
  return Response.json({ ok: true, body })
}
TS
echo scaffolded
