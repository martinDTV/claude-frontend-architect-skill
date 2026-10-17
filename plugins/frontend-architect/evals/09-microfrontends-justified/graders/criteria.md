---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Recommends route-based composition behind a reverse proxy (or multi-zones) with base paths
- Shared HttpOnly session cookie on the same domain; login owned by one app
- Shared design tokens and contracts packages, not shared components across frameworks
- Plain anchor navigation between apps; observability via propagated request IDs

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends @module-federation/nextjs-mf with the App Router or Next 16
- Suggests embedding React components inside Vue components natively
