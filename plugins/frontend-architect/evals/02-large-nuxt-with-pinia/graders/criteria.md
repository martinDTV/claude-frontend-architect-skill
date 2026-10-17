---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Classifies state kinds before choosing tools
- Puts active warehouse and the draft order builder in Pinia setup stores per feature
- Keeps server data (orders, inventory) in a query cache (Pinia Colada) or useFetch, not in Pinia
- Uses a feature-based structure

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Puts all server data in Pinia stores
- Proposes a single global app store for everything
