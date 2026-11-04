#!/usr/bin/env bash
# Next.js App Router (React). GENERALIZATION of the nondeterministic-render rule, which the
# development state corpus never exercises (that corpus tests token-in-web-storage, module-level
# state, http-client auth, server-data-in-store, persist and logout). Here a Server Component
# computes Math.random() directly in its render body to build a DOM id. During SSR the server
# picks one value and the client picks another on hydration: a classic hydration mismatch.
# A human reads this straight off the source: the value is produced in the component body (not in
# useEffect, not behind a guard), so server and client markup disagree. Level heuristic.
# Different framework (React, not the Nuxt composables of the dev corpus), different identifiers,
# different carrier (Math.random for a DOM id, not a storage write).
set -euo pipefail
mkdir -p src/app/promo

cat > package.json <<'EOF'
{ "name": "holdout-nondeterministic", "private": true,
  "dependencies": { "next": "^15.6.0", "react": "^19.2.0", "react-dom": "^19.2.0" } }
EOF
cat > next.config.mjs <<'EOF'
export default {}
EOF

cat > src/app/promo/PromoBanner.tsx <<'EOF'
export function PromoBanner({ label }: { label: string }) {
  const fieldId = `promo-${Math.random().toString(36).slice(2)}`
  return (
    <label htmlFor={fieldId}>
      {label}
      <input id={fieldId} />
    </label>
  )
}
EOF

cat > src/app/promo/page.tsx <<'EOF'
import { PromoBanner } from './PromoBanner'
export default function Page() {
  return <PromoBanner label="Sign up" />
}
EOF
echo "scaffolded holdout-nondeterministic"
