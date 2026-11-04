#!/usr/bin/env bash
# Next.js App Router app. GENERALIZATION of the server/client-boundary rules, a surface the
# development arch corpus never exercises (it tests feature-internal-import, domain-cycle,
# shell/shared boundaries, and a type-only Next combined case — never the 'server-only' guard).
#
# DEFECT: src/features/billing/invoiceToken.ts imports 'server-only' (so it must never reach the
# client bundle), yet src/features/billing/InvoiceBadge.tsx is a 'use client' component that
# imports it directly. A human reads this as: the server-only module (and whatever secret it
# closes over) is being pulled into a client component — exactly what the 'server-only' marker
# exists to forbid; Next's build fails on it. The import is an explicit static import (verified
# edge), so the honest level is confirmed.
set -euo pipefail
mkdir -p src/features/billing src/app/billing

cat > package.json <<'EOF'
{ "name": "holdout-next-server-only", "private": true,
  "dependencies": { "next": "^15.6.0", "react": "^19.2.0", "react-dom": "^19.2.0", "server-only": "^0.0.1" } }
EOF
cat > next.config.mjs <<'EOF'
export default {}
EOF

# server-only billing internals: must stay on the server
cat > src/features/billing/invoiceToken.ts <<'EOF'
import 'server-only'
const SIGNING_SECRET = process.env.INVOICE_SIGNING_SECRET
export function signInvoice(id: string): string {
  return `${id}.${SIGNING_SECRET}`
}
EOF

# DEFECT: a 'use client' component imports the server-only module directly
cat > src/features/billing/InvoiceBadge.tsx <<'EOF'
'use client'
import { signInvoice } from './invoiceToken'
export function InvoiceBadge({ id }: { id: string }) {
  return <span>{signInvoice(id)}</span>
}
EOF

cat > src/app/billing/page.tsx <<'EOF'
import { InvoiceBadge } from '../../features/billing/InvoiceBadge'
export default function Page() {
  return <InvoiceBadge id="inv_1" />
}
EOF
echo "scaffolded holdout-next-server-only"
