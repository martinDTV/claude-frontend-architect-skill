---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Lists the form checks: duplicate submit (double click, Enter plus click, retry on a slow network), a pending state with the submit disabled and visible progress, errors associated with their fields (`aria-describedby`, `aria-invalid`), focus moved to the first error, a success confirmation, late or out-of-order responses (a stale response after a newer submit or after leaving the page), navigation away with unsaved data, and session expiry or change during the form
- Says what the static audit (`ui-audit.mjs --rules forms`) can see and at which level: `form-without-pending-state`, `form-error-not-associated` and `required-visual-only` as heuristic / review findings (the markup suggests, it cannot prove), and says plainly that the static audit cannot prove a double submit
- Says that `form-double-submit` is confirmed only in browser mode, when two requests actually reach the server from one double click; that this needs `browser-audit.mjs` with `--checks forms` and `--allow-submit`; that it must run only against a local build or a staging environment where test submissions are acceptable, never production; and that destructive buttons (delete, remove, pay) are never clicked even with `--allow-submit`, so the pay step itself is verified with a test payment path or by review
- Names the related browser findings for the feedback problem: `form-no-pending-state`, `form-no-validation-feedback`, `form-focus-not-moved-to-error`, `form-no-success-feedback`
- When reasoning about the pending flag, distinguishes local state (the form's own `pending`/`submitting` flag, set before the request and reset in `finally`), remote state (the order on the server, protected by an idempotency key or client-generated order id so a retry does not create a second order) and unknown state (timeout or navigation before the response: the UI must neither claim success nor allow a blind retry without checking the order status)
- Proposes concrete fixes: the handler guarded by the same flag that disables the button, idempotency key per attempt sent with the POST, success and error feedback that is announced (`role="status"` / `role="alert"`) and focus management to the first error

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Suggests running the browser mode with `--allow-submit` against production
- Claims the static audit proves or confirms the double submit
- Proposes a global Pinia store as the fix for the form's pending or error state
- Fixes only the button (disable while pending) without the idempotency and unknown-state discussion
