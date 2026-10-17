---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Pages and data fetching in Server Components with fetch
- Only the wishlist button and filters are Client Components
- Mentions Next 16 caching (Cache Components / use cache) or explicit revalidation, and filter state in the URL

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Marks the whole page or layout 'use client'
- Fetches product data in useEffect on the client
- Recommends middleware.ts without noting Next 16 uses proxy.ts
