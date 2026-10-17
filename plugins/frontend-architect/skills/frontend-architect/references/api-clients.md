# API clients

## Contents
- Choosing the HTTP approach
- Axios vs fetch: the real differences
- The layered architecture (and when to collapse it)
- Contracts: types are not validation
- Errors
- Cancellation, timeouts, retries, idempotency
- GraphQL and generated clients
- Anti-patterns

## Choosing the HTTP approach

| Situation | Default choice |
|---|---|
| Nuxt, page-level data, simple needs | `useFetch` / `useAsyncData` with a custom `$fetch` instance |
| Nuxt, data shared across components, mutations, invalidation | Pinia Colada over a service using `$fetch` or Axios |
| Next.js Server Components, Route Handlers, Server Functions | Native `fetch` (integrates with Next caching and request memoization) |
| Next.js / React client-side server state | TanStack Query over a service using `fetch` or Axios |
| Backend publishes OpenAPI | Generate types or a client (`openapi-typescript` + `openapi-fetch`, `@hey-api/openapi-ts`, `orval`) instead of handwriting DTOs |
| GraphQL backend | A typed GraphQL client with codegen; not Axios |
| Same client shared by several apps or a non-framework package | A framework-agnostic client (Axios or ofetch) in a shared package |

**Axios is chosen for a reason, never by default.** Valid reasons:
- Upload/download **progress events** (`onUploadProgress`): fetch has no upload progress in browsers.
- An existing interceptor-based ecosystem or a generated client that targets Axios.
- One client shared across Nuxt, Next.js, Node scripts and tests with identical behavior.
- Team standard with established tooling (mock adapters, interceptors for tracing).

**fetch/ofetch is preferred when**: in Nuxt (`$fetch` is built in, SSR-aware, and calls internal `server/api` routes without an HTTP round trip), in Next.js server code (Axios bypasses `fetch` request memoization), when bundle size matters, or when there is no reason above.

## Axios vs fetch

| Concern | Axios | fetch / ofetch |
|---|---|---|
| Bundle | Extra dependency | Native (ofetch is small, bundled in Nuxt) |
| Interceptors | Built in | ofetch: `onRequest`/`onResponse` hooks; fetch: wrap it |
| Errors on 4xx/5xx | Rejects | fetch resolves (check `res.ok`); ofetch rejects |
| JSON | Automatic | ofetch automatic; fetch manual |
| Timeouts | `timeout` option | `AbortSignal.timeout(ms)`; ofetch `timeout` |
| Cancellation | `signal` (AbortController) | `signal` |
| Upload progress | Yes | No (browsers) |
| Next.js caching integration | No | Yes |
| Nuxt SSR internal calls | No (always HTTP) | `$fetch` calls Nitro directly |
| Streaming responses | Limited in browsers | Yes |

Neither is "better". The layering below is identical with either, so the client can be swapped.

## The layered architecture

```
Page / Component        presentation and interaction only
      ↓
Composable / Hook       binds data to reactive state, exposes actions
      ↓
Query cache             Pinia Colada / TanStack Query (or useFetch for page data)
      ↓
Domain service          one per business area: endpoints, params, response validation
      ↓
HTTP instance           base URL, headers, auth, interceptors, error normalization
      ↓
Backend
```

Responsibilities:
- **HTTP instance**: transport policy only. Created by a factory and **injected**, never imported as a global in SSR apps. One instance per app in the browser; one per request on the server.
- **Domain service** (`users.service.ts`): functions that call endpoints, accept a `signal`, validate responses and return domain types. No reactive state, no toasts, no routing.
- **Query cache**: caching, deduplication, refetching, invalidation, loading and error state.
- **Composable/hook**: query keys, combining queries, exposing mutations with invalidation. Components consume this.
- **Component**: renders states and forwards user intent.

**Collapse layers when they add nothing.** Stage 0: `useFetch('/api/orders')` in the page is correct. A service with one endpoint used in one place can live inside the composable. Add the layer when a second consumer or a second endpoint for the same domain appears.

Implementation with Axios in Nuxt and Next.js: `axios.md`. The same shape with `$fetch` in Nuxt: `nuxt.md` (custom fetch section).

## Contracts: types are not validation

TypeScript types disappear at runtime. A backend change or a wrong assumption produces `undefined` deep in the UI instead of a clear error at the boundary.

- Validate responses where they enter the app (the service) with Zod or Valibot, and infer the TypeScript type from the schema. Valibot is smaller for bundle-sensitive apps; Zod has a larger ecosystem.
- With OpenAPI, generate the types and still validate critical or third-party responses.
- Validate the other untrusted inputs too: route params, query strings, `localStorage`, `postMessage`, webhooks.
- Map wire formats (snake_case, ISO strings) to domain formats in the service, once.

## Errors

Normalize every transport error into one app-level error type with a discriminated `kind` (`network`, `timeout`, `canceled`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `validation`, `rate_limited`, `server`, `contract`). Parse RFC 9457 Problem Details bodies when the backend sends them. Components branch on `kind`, never on Axios or fetch internals. `axios.md` has a tested implementation.

User-facing handling:
- `validation` → field errors in the form.
- `unauthorized` → session refresh once, then redirect to login.
- `forbidden`/`not_found` → dedicated states, not generic toasts.
- `network`/`timeout`/`server` → retry affordance; the query layer retries automatically for reads.
- `canceled` → ignore silently.

## Cancellation, timeouts, retries, idempotency

- Pass the query library's `signal` down to the service and the HTTP call, so navigation and stale requests cancel.
- Set a timeout on every request (Axios `timeout`, `AbortSignal.timeout`).
- **Retry in one place only.** Query libraries already retry failed reads; do not add Axios retry interceptors on top, or one failure becomes nine requests.
- Retry only idempotent requests (GET, HEAD, PUT, DELETE when the backend makes them idempotent). For POST, send an `Idempotency-Key` header if the backend supports it before retrying.
- Use backoff with jitter; respect `Retry-After` on 429 and 503.

## GraphQL and generated clients

- GraphQL: use a typed client with code generation (for example GraphQL Codegen with a lightweight client, or Apollo/urql when their normalized cache is needed). Do not put a second cache (Pinia Colada/TanStack Query) on top of a normalized GraphQL cache without a strategy.
- OpenAPI: generated clients replace handwritten services; keep a thin domain service only if you need mapping or validation beyond the generated code.

## Anti-patterns

- `axios.create()` inside every service file (several instances with drifting config).
- A module-level instance whose `Authorization` header is mutated at login, in an SSR app: user A's token can serve user B's request.
- Services that `useToast()`, `router.push()` or touch stores.
- Copying query results into a Pinia/Zustand store "to share them": the query cache is already shared.
- `as User` casts on API responses instead of validation.
- Catching errors in the service and returning `null`, which hides failures from the query layer.
