---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Creates the Axios instance in a Nuxt plugin per request and provides it
- Forwards the cookie header on the server and uses an absolute server URL
- Services are factory functions receiving the instance and validating responses
- Composables use useQuery/useMutation with hierarchical keys and invalidation, passing the abort signal

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Creates a module-level Axios singleton whose Authorization header is mutated at login
- Copies query results into a Pinia store
- Adds an Axios retry interceptor on top of query retries without discussing double retries
