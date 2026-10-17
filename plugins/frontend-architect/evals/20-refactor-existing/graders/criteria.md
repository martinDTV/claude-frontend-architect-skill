---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Splits by state kind: server data to Pinia Colada/useFetch, filters to URL, theme to preferences store, cart to a cart store
- Extracts a users service and composables; splits the component
- Incremental steps with tests; respects existing conventions

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Keeps server data in the store
- Proposes rewriting the app in another framework
