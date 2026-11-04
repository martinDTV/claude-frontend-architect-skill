#!/usr/bin/env bash
# Nuxt 4 app. GENERALIZATION of the raw-state-key-shared rule, which the development state corpus
# never exercises (it has no useState case at all). The same raw useState literal, 'wizardStep',
# is created in two different business domains:
#   features/checkout/useCheckoutWizard.ts  -> useState('wizardStep')
#   features/onboarding/useOnboardingWizard.ts -> useState('wizardStep')
# Because Nuxt's useState key is a global string, both composables read and write the SAME piece of
# server-shared state. A human reads this as a real coupling smell: two unrelated domains silently
# share one global key with no typed owner; stepping the checkout wizard mutates the onboarding
# wizard. It is genuinely ambiguous (it could be an accidental collision or a deliberate shared
# value), so the honest level is heuristic, raised because the key spans two domains. Uses a Nuxt
# useState carrier and feature-domain identifiers absent from the dev corpus.
set -euo pipefail
mkdir -p app/features/checkout app/features/onboarding

cat > package.json <<'EOF'
{ "name": "holdout-raw-state-key", "private": true, "dependencies": { "nuxt": "^4.6.0" } }
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({ compatibilityDate: '2026-10-01' })
EOF
cat > .frontend-audit.json <<'EOF'
{
  "domains": {
    "checkout": ["app/features/checkout/**"],
    "onboarding": ["app/features/onboarding/**"]
  }
}
EOF
cat > app/app.vue <<'EOF'
<template><NuxtPage /></template>
EOF

cat > app/features/checkout/useCheckoutWizard.ts <<'EOF'
export function useCheckoutWizard() {
  const step = useState('wizardStep', () => 0)
  return { step, next: () => step.value++ }
}
EOF

cat > app/features/onboarding/useOnboardingWizard.ts <<'EOF'
export function useOnboardingWizard() {
  const step = useState('wizardStep', () => 0)
  return { step, back: () => step.value-- }
}
EOF
echo "scaffolded holdout-raw-state-key"
