#!/usr/bin/env bash
# Clean, well-structured Next.js App Router app with NO boundary defects:
#  - two business domains (catalog, checkout), each with a public index.ts; checkout imports catalog
#    ONLY through catalog/index.ts (public entry), never a private file;
#  - shared/ code (money.ts) is domain-free (pure formatting), depended on BY domains, never the reverse;
#  - the shell (middleware) depends only on the "auth" domain, which is a coreDomain the shell may use;
#  - no cycles (checkout -> catalog only, not back), no hotspots (no file used by 3+ domains).
# A correct auditor reports zero defect-level findings.
set -euo pipefail
mkdir -p src/shared src/features/auth src/features/catalog/internal src/features/checkout src/app/checkout src/middleware

cat > package.json <<'EOF'
{ "name": "arch-clean-app", "private": true, "dependencies": { "next": "^15.0.0", "react": "^19.0.0" } }
EOF
cat > next.config.mjs <<'EOF'
export default {}
EOF
cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }
EOF

# domain-free shared formatting util
cat > src/shared/money.ts <<'EOF'
export function formatMoney(n: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n) }
EOF

# auth domain (a coreDomain the shell is allowed to use)
cat > src/features/auth/index.ts <<'EOF'
export { requireUser } from './guard'
EOF
cat > src/features/auth/guard.ts <<'EOF'
export function requireUser(): boolean { return true }
EOF

# catalog domain: public index re-exports its OWN internals; uses shared money (allowed direction)
cat > src/features/catalog/index.ts <<'EOF'
export { getProducts } from './internal/repo'
export type { Product } from './internal/repo'
EOF
cat > src/features/catalog/internal/repo.ts <<'EOF'
import { formatMoney } from '@/shared/money'
export interface Product { id: string; label: string }
export function getProducts(): Product[] { return [{ id: 'a', label: formatMoney(10) }] }
EOF

# checkout domain: imports catalog ONLY through its public index
cat > src/features/checkout/index.ts <<'EOF'
export { useCheckout } from './useCheckout'
EOF
cat > src/features/checkout/useCheckout.ts <<'EOF'
import { getProducts } from '@/features/catalog'
import { formatMoney } from '@/shared/money'
export function useCheckout() { return { items: getProducts(), fmt: formatMoney } }
EOF

# shell: middleware depends only on the auth coreDomain
cat > src/middleware.ts <<'EOF'
import { requireUser } from '@/features/auth'
export function middleware() { return requireUser() }
EOF

cat > src/app/checkout/page.tsx <<'EOF'
import { useCheckout } from '@/features/checkout'
export default function Page() { const { items } = useCheckout(); return <ul>{items.map((p) => <li key={p.id}>{p.label}</li>)}</ul> }
EOF
echo "scaffolded arch-clean-app"
