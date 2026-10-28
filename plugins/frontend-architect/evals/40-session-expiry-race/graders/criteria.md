---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Single-flight refresh shared by concurrent 401s, retry once, one redirect preserving the return URL; draft preserved (persisted draft with expiry or in-memory until navigation)
- Cancels or ignores stale responses; distinguishes network errors from auth errors
- Tests: concurrent 401s → one refresh call and both requests succeed; refresh failure → one redirect; draft survives; uses Vitest with a fake adapter/MSW and no sleeps

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Proposes retrying every request independently with its own refresh call
- Stores the token in localStorage to 'keep users logged in'
- Suggests tests with fixed sleeps
