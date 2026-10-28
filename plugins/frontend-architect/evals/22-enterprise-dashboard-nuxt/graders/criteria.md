---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Visual: prioritizes the few numbers that drive action, uses density appropriate for all-day desktop use, consistent states (loading skeletons sized like content, empty, error)
- Data: server-side pagination/filtering for the table with filter state in the URL, a query cache (Pinia Colada or useFetch) with staleTime/refetchInterval for the alerts, no Pinia store holding server data
- Charts: picks a library by need, lazy-loads it, provides a text/table alternative and disposes instances
- Uses Nuxt UI components (UTable or TanStack) rather than hand-made tables

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Puts tasks or KPIs in a Pinia store copied from the API
- Proposes Three.js, heavy animation or decorative gradients for an operational tool
- Polls by setInterval inside components without cleanup
