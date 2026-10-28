---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Identifies the module-level `currentTenant` as a cross-request hazard under SSR: the server module is shared by all requests, so one request's tenant can be read by another's render or API call; states that this is demonstrated by the code shape and must be moved to per-request state (`useState`, a plugin-provided per-request client, or the request event context) with the header set per request
- Explains the late response as a separate client-side race: the response is applied without checking that the identity (tenant) it was requested under is still current; fix with an identity epoch or abort on switch (abort in-flight requests, drop results whose epoch differs), tenant included in every query key so caches never mix, and caches cleared on switch
- Separates evidence tiers: the module-level tenant under SSR is a demonstrated leak pattern; whether it has leaked data in production is unknown without logs; the late-response bug is reproducible with a delayed request
- Proposes tests: an SSR concurrency test with concurrent requests from different tenant sessions asserting each response contains only its own tenant, and a unit test with deferred promises for the epoch guard; mentions the backend must still enforce the tenant on every request

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Claims switching to `ssr: false` fixes the late-response problem (it only removes the cross-request risk)
- Says using Pinia or a global store by itself solves isolation
- Dismisses the module-level tenant as fine because it is "set from the session"
- Treats the frontend changes as the security boundary without mentioning backend enforcement of the tenant
