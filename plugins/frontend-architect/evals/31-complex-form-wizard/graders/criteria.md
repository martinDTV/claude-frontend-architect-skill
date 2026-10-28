---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Schema-first (Zod/Valibot with UForm or vee-validate), one place that maps 422 field errors to fields
- Step state in URL, draft persisted with expiry and versioned key (no tokens or secrets), resume flow, unsaved-changes guard
- Uploads via signed URLs with client-side checks and server-side validation/scanning; progress needs XHR/Axios
- Accessibility: labels, errors linked with aria-describedby/aria-invalid, focus management between steps; review step before submit

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Keeps the whole form in a global Pinia store as the primary design
- Validates only on the client
- Persists uploaded documents or tokens in localStorage
