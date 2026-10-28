---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Explains the mechanism: a module imported from a `'use client'` file is bundled for the browser; a non-`NEXT_PUBLIC_` variable read at module scope may be inlined or empty in the client bundle, so the helper either ships the secret or breaks silently, and the dependency itself is the defect
- Fix: mark server modules with `import 'server-only'` so the build fails on a client import; split the feature's exports into a client-safe `index.ts` and a `server.ts`; move the Stripe call to a Server Component, Server Function or Route Handler and pass the session id or URL down as props or a response; treat the secret as compromised and rotate it if it was ever part of a client bundle
- Detection: a dependency graph that follows imports across the `'use client'` boundary (files reachable from client components that import `server-only` modules or read non-public env vars); mentions bundle analysis as a check and the plugin's domain-deps / routes-audit tooling or an equivalent rule
- Keeps the distinction: `'use client'` is not the problem; the problem is what the client subtree imports

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Says `'use client'` itself is the mistake and recommends removing it as the fix
- Suggests renaming the variable to `NEXT_PUBLIC_STRIPE_SECRET` or otherwise exposing the secret to the browser
- Claims the situation is safe because the build passed
- Skips rotating the secret
