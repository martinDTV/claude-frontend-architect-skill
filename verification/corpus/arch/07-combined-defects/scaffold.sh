#!/usr/bin/env bash
# Next.js (App Router, src/) app with TWO distinct, independent architecture defects:
#  Defect 1 (shared-imports-domain): src/shared/format.ts  — generic shared code — imports a type and a
#     value from the "billing" business domain. Shared code must not know about any one domain.
#  Defect 2 (feature-internal-import): src/features/reports/report.ts reaches into the PRIVATE internals
#     of the "users" feature (src/features/users/internal/db) instead of its public index.ts.
# The two defects are in different files and are of different kinds; a correct auditor reports both.
set -euo pipefail
mkdir -p src/shared src/features/billing src/features/users/internal src/features/reports src/app/reports

cat > package.json <<'EOF'
{ "name": "arch-combined-app", "private": true, "dependencies": { "next": "^15.0.0", "react": "^19.0.0" } }
EOF
cat > next.config.mjs <<'EOF'
export default {}
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }
EOF

# billing domain
cat > src/features/billing/index.ts <<'EOF'
export { getPlan } from './plan'
export type { Plan } from './plan'
EOF
cat > src/features/billing/plan.ts <<'EOF'
export interface Plan { id: string; price: number }
export function getPlan(): Plan { return { id: 'pro', price: 20 } }
EOF

# DEFECT 1: shared code imports from the billing business domain
cat > src/shared/format.ts <<'EOF'
import { getPlan } from '@/features/billing'
import type { Plan } from '@/features/billing'
export function label(p: Plan): string { return `${p.id}: ${getPlan().price}` }
EOF

# users domain with public entry and private internals
cat > src/features/users/index.ts <<'EOF'
export { useUsers } from './useUsers'
EOF
cat > src/features/users/useUsers.ts <<'EOF'
import { query } from './internal/db'
export function useUsers() { return { all: () => query('users') } }
EOF
cat > src/features/users/internal/db.ts <<'EOF'
export function query(_t: string): unknown[] { return [] }
EOF

# DEFECT 2: reports reaches into users' PRIVATE internal db
cat > src/features/reports/report.ts <<'EOF'
import { query } from '@/features/users/internal/db'
export function report() { return query('reports') }
EOF

cat > src/app/reports/page.tsx <<'EOF'
import { report } from '@/features/reports/report'
export default function Page() { return <pre>{JSON.stringify(report())}</pre> }
EOF
echo "scaffolded arch-combined-app"
