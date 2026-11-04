#!/usr/bin/env bash
# GENERALIZATION (set B). Next.js App Router, combined defects on carriers the development corpus does not
# use for these ids:
#   DEFECT A (client-boundary-too-high, confirmed, high): app/(workspace)/layout.tsx has 'use client' at
#             the very top, so the whole workspace subtree ships and renders as client JavaScript.
#   DEFECT B (hardcoded-role-check, heuristic): the same layout gates UI with a literal role comparison,
#             user.role === 'owner', in client UI code instead of reading a server-provided permission.
# The segment uses a route group (workspace) so the route path is '/'. A sibling Nav.tsx is a small client
# leaf that compares an ARIA role value (role === 'tablist'), which must NOT be flagged as a permission check.
set -euo pipefail
mkdir -p "src/app/(workspace)" src/components

cat > package.json <<'EOF'
{ "name": "holdout-routes-workspace", "private": true, "dependencies": { "next": "16.4.0", "react": "19.3.0", "react-dom": "19.3.0" } }
EOF

cat > tsconfig.json <<'EOF'
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "jsx": "preserve", "strict": true, "skipLibCheck": true } }
EOF

cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next'
const config: NextConfig = { reactStrictMode: true }
export default config
EOF

# DEFECT A + B live here: a client layout with a literal role gate.
cat > "src/app/(workspace)/layout.tsx" <<'EOF'
'use client'
import { useCurrentUser } from '../../components/useCurrentUser'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser()
  const canManage = user.role === 'owner'
  return (
    <div>
      {canManage ? <aside>Admin tools</aside> : null}
      {children}
    </div>
  )
}
EOF

cat > "src/app/(workspace)/page.tsx" <<'EOF'
export default function WorkspaceHome() {
  return <main><h1>Workspace</h1></main>
}
EOF

cat > src/components/useCurrentUser.ts <<'EOF'
export function useCurrentUser() {
  return { id: 'u1', role: 'member' as 'owner' | 'member' }
}
EOF

# A client leaf that compares an ARIA role value, not a permission: must NOT be flagged.
cat > src/components/Nav.tsx <<'EOF'
'use client'
export function Nav({ role }: { role: string }) {
  const isTabs = role === 'tablist'
  return <nav aria-label={isTabs ? 'tabs' : 'menu'}>nav</nav>
}
EOF

echo "scaffolded holdout-routes-workspace"
