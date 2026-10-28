---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Order: error tracking with source maps and release tags; Web Vitals field data per route/device; API latency/error rates from the client; then custom business events
- Trace/request-id propagation from proxy through SSR to the API; structured SSR logs with per-request context
- PII/PHI scrubbing, consent, sampling; never tokens, full URLs with ids, or form contents
- Alerts/SLOs per key route and per release; budgets in CI to prevent regressions

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Proposes logging full requests/responses or user identifiers in plain text
- Starts with a rewrite or a new framework
- Ignores source maps/release correlation
