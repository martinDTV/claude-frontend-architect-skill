---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Uses TanStack Query with refetchInterval and optimistic mutation with rollback
- Service layer per domain using the existing Axios client or fetch, with signal
- One QueryClient per browser session and per server request

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Copies query data into Zustand or Redux
- Creates a module-level Axios instance holding per-user tokens rendered during SSR
