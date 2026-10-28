---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- One deployment path; retire the duplicate pipeline deliberately
- Build once, promote the same artifact across environments; runtime configuration read at start (or a config endpoint) rather than values baked per environment; tenant derived from the host at runtime
- Cache headers: immutable hashed assets, HTML short/no-store, private for authenticated pages; wildcard certificate and CDN behaviors for subdomains; instant rollback by keeping previous builds
- CI gates in order (typecheck, lint, boundaries, tests, build, e2e, budgets) and security headers at the edge

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Keeps both deployment paths
- Rebuilds per environment with baked public config as the recommended model
- Caches authenticated HTML in the CDN
