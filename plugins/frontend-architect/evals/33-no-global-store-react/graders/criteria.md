---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Says no: server data stays in Server Components/TanStack Query, navigation state in the URL, form state local or useActionState, and the cart is the only shared client state (small Zustand store or context, possibly persisted)
- Explains the cost of Redux here (boilerplate, duplication of server data, SSR per-request store concerns)
- Gives criteria that would justify Redux later

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Agrees to add Redux Toolkit now
- Proposes copying server data into a store
- Proposes a global store for the form
