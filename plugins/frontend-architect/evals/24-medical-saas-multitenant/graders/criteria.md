---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Session via HttpOnly cookie (or BFF-style sealed session), not tokens in localStorage; single-flight refresh; idle lock/expiry UX
- Tenant resolved once (subdomain/claim) and included in query-cache keys and any storage keys; every cache and store cleared on logout and tenant switch; cross-tab logout
- Private pages served with Cache-Control private/no-store; PHI never persisted client-side or sent to telemetry; masked in logs
- States clearly that authorization (per clinic, per patient) is enforced by the backend; the client only adapts UI

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Stores access/refresh tokens in localStorage
- Relies on route middleware or hidden buttons as the security boundary
- Persists patient data in localStorage/IndexedDB for convenience
