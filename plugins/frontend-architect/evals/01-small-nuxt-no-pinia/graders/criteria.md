---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Recommends a simple app (stage 0): framework defaults, pages + components
- Uses useFetch/useAsyncData (or prerendering) for blog data
- Suggests prerender/SSG or route rules for the blog for SEO

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends adding Pinia to hold the blog posts
- Recommends Axios without a concrete reason
- Proposes a features/ layered architecture, monorepo or microfrontends for this site
