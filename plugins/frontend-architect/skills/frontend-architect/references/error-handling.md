# Error handling

Errors are a feature: every failure has a defined owner, a defined UI and a defined trace. The taxonomy comes from `api-clients.md` and `axios.md` (`ApiError` with a `kind`); this reference covers what happens after the error exists.

## Contents
- From error kind to UI action
- Boundaries: where errors are caught
- Query-layer errors
- Recovery flows
- What the user sees, what they never see
- Reporting and deduplication
- The silent catch
- Vue / Nuxt specifics
- React / Next.js specifics
- Testing error paths

## From error kind to UI action

Components should branch on an **action**, not on a status code or on `instanceof` checks scattered across the app. One pure mapper, reused by pages, toasts and boundaries:

```ts
// @verify vue:lib/errors/to-ui-state.ts
import { type ApiError, type ApiErrorKind, toApiError } from '@/lib/http/errors'

/** What the UI does with a failed request. Components branch on `action`, never on status codes. */
export type ErrorUiState =
  | { action: 'retry'; title: string; description: string; retryable: true }
  | { action: 'login'; title: string; description: string; retryable: false }
  | { action: 'forbidden'; title: string; description: string; retryable: false }
  | { action: 'not-found'; title: string; description: string; retryable: false }
  | { action: 'fix-input'; title: string; description: string; retryable: false; details: unknown }
  | { action: 'ignore' }
  | { action: 'report'; title: string; description: string; retryable: true; code?: string }

const RETRYABLE: ReadonlySet<ApiErrorKind> = new Set(['network', 'timeout', 'server', 'rate_limited'])

/** Pure mapping so it can be unit-tested and reused by toasts, pages and error boundaries. */
export function toErrorUiState(error: unknown): ErrorUiState {
  const api: ApiError = toApiError(error)
  switch (api.kind) {
    case 'canceled':
      return { action: 'ignore' }
    case 'unauthorized':
      return { action: 'login', title: 'Your session has expired', description: 'Sign in again to continue.', retryable: false }
    case 'forbidden':
      return { action: 'forbidden', title: 'No access', description: 'You do not have permission to see this. Ask an administrator if you think you should.', retryable: false }
    case 'not_found':
      return { action: 'not-found', title: 'Not found', description: 'This item no longer exists or was moved.', retryable: false }
    case 'validation':
    case 'conflict':
      return { action: 'fix-input', title: 'Check the data', description: api.message, retryable: false, details: api.details }
    case 'contract':
      return { action: 'report', title: 'Something is off on our side', description: 'The server answered in an unexpected format. We have been notified.', retryable: true, code: api.code }
    default:
      return RETRYABLE.has(api.kind)
        ? { action: 'retry', title: 'Could not load', description: api.kind === 'network' ? 'Check your connection and try again.' : 'The service is slow or unavailable. Try again in a moment.', retryable: true }
        : { action: 'report', title: 'Unexpected error', description: 'Try again. If it keeps happening, contact support.', retryable: true, code: api.code }
  }
}
```

```ts
// @verify vue:lib/errors/to-ui-state.test.ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/http/errors'
import { toErrorUiState } from './to-ui-state'

describe('toErrorUiState', () => {
  it('maps kinds to actions without leaking server details', () => {
    expect(toErrorUiState(new ApiError('unauthorized', 'jwt expired', 401)).action).toBe('login')
    expect(toErrorUiState(new ApiError('forbidden', 'denied', 403)).action).toBe('forbidden')
    expect(toErrorUiState(new ApiError('server', 'TypeError at /srv/app.py:42', 500))).toMatchObject({ action: 'retry', retryable: true })
    expect(JSON.stringify(toErrorUiState(new ApiError('server', 'TypeError at /srv/app.py:42', 500)))).not.toContain('app.py')
    expect(toErrorUiState(new ApiError('canceled', 'x'))).toEqual({ action: 'ignore' })
  })

  it('keeps validation details for the form layer and treats non-Axios errors as reportable', () => {
    const v = toErrorUiState(new ApiError('validation', 'Invalid', 422, undefined, { email: ['taken'] }))
    expect(v).toMatchObject({ action: 'fix-input', details: { email: ['taken'] } })
    expect(toErrorUiState(new TypeError('x is not a function')).action).toBe('report')
  })
})
```

The strings here are placeholders: in a real app they are i18n keys (`i18n.md`). `details` for `fix-input` go through `toFormErrors` (`forms.md`).

## Boundaries: where errors are caught

| Level | Catches | Shows |
|---|---|---|
| Field / form | Validation and conflict errors of a submit | Field messages, form summary |
| Component / widget | Failures of one data view | The view's error state with retry; the rest of the page works |
| Route / page | Errors thrown during page load | A full-page error with navigation back; `404` for missing entities |
| App | Anything unhandled | Last-resort page; report to telemetry |
| Transport | Every request | Normalizes into `ApiError`, refreshes the session once (`axios.md`) |

Catch at the lowest level that can give the user a meaningful next step; let everything else propagate to the next boundary. A page-level catch that turns every failure into a toast hides broken widgets.

## Query-layer errors

- Pinia Colada: `state.status === 'error'` with `state.error`; mutations expose `error` and `onError`; configure global retry (`retry` option; default retries reads) and do not add transport retries on top.
- TanStack Query: `status`/`error`, `retry` (default 3 for queries, 0 for mutations), `throwOnError` to push errors to the nearest React error boundary when the page cannot render without the data.
- Do not catch inside the query function and return `null`: the error state never appears and the UI shows "empty".
- Distinguish background refetch errors (keep stale data, show a subtle indicator) from first-load errors (show the error state).

## Recovery flows

| Situation | Flow |
|---|---|
| Access token expired | The client refreshes **once** for all concurrent requests (single-flight, tested in `axios.md`), retries them; if refresh fails, redirect to login with the return URL (`?next=`), clear caches |
| Session revoked server-side (password change, admin action) | Refresh returns 401: same as above; broadcast logout to other tabs (`realtime-and-sync.md`) |
| Permission revoked for a resource | 403 on a request: show the `forbidden` state, invalidate the queries of that resource and the permission matrix, update navigation; do not loop retries |
| Tenant switched | Clear query caches and tenant-scoped stores before fetching anything in the new tenant; restart streams |
| Entity deleted by someone else | 404 on a detail page: `not-found` state with a link back to the list; invalidate the list |
| Offline | Detect (`navigator.onLine` plus failed requests), disable mutations or queue them (only if the product needs offline), keep cached reads visible with a banner |
| Backend deploy / 503 | Retry with backoff and `Retry-After`; show maintenance copy after N failures |
| Version skew (old client, new API) | `contract` errors spike after a deploy: show "reload to update" when the client build id differs from the server's (`useRuntimeConfig().app.buildId` in Nuxt, a `/version` endpoint, or the framework's chunk-load error handler) |

Chunk load failures after a deploy (`Failed to fetch dynamically imported module`) are recoverable: reload once (guard with a session flag to avoid loops). Nuxt handles this with `app:chunkError`; configure `experimental.emitRouteChunkError` per version docs.

## What the user sees, what they never see

See: what happened in plain language, what they can do, and a reference id when support may be needed. Never see: stack traces, backend exception messages, SQL, file paths, internal ids, other users' data, raw JSON. Normalize at the transport layer so a backend that leaks does not become a frontend that leaks (`security.md`).

## Reporting and deduplication

- Report unexpected errors (`report` action, uncaught exceptions, chunk failures) to the error tracker with: route, feature, release/build id, hashed user and tenant ids, request id from the `X-Request-Id` header, and the `ApiError.kind` and status. Not: request bodies, tokens, personal data (`observability.md`).
- Expected errors (`validation`, `forbidden`, `not_found`, `canceled`) are metrics, not alerts.
- Deduplicate by fingerprint (kind + endpoint template + status) and rate-limit per session; one broken widget must not send 500 events.
- Attach breadcrumbs (navigation, last requests) only with PII scrubbing configured.

## The silent catch

`catch {}` and `catch (e) { console.log(e) }` hide failures until a user reports them weeks later. Policy for every `catch`:
1. **Handle**: produce a defined state (`toErrorUiState`) or a fallback the product accepts.
2. **Translate**: wrap in a domain error with context and rethrow.
3. **Report**: send to telemetry and show the generic state.
4. Never swallow. If an error is intentionally ignored (`canceled`), say so in code: `if (toApiError(e).kind !== 'canceled') throw e`.

Enforce with lint: `no-empty` (with `allowEmptyCatch: false`), and a project rule such as `no-restricted-syntax` on `CatchClause > BlockStatement[body.length=0]`, plus a review rule that `console.error` in a catch is not handling.

## Vue / Nuxt specifics

- `createError({ statusCode, statusMessage, fatal })` in pages, composables and server routes; `showError()`/`clearError()` for imperative flows; `app/error.vue` receives the error and renders by status.
- `<NuxtErrorBoundary>` isolates a component subtree with an `#error` slot and `clearError`; `onErrorCaptured` in a component for finer control (return `false` to stop propagation).
- Hooks: `vue:error` (component errors) and `app:error` (fatal errors) in a plugin, for reporting; `app:chunkError` for stale chunks.
- Nitro: `createError` with `data` for structured bodies; never pass backend error bodies through unfiltered; set `fatal: false` for recoverable page errors.
- `useFetch`/`useAsyncData` expose `error` refs; `$fetch` throws `FetchError` with `status`/`data` (normalize it like Axios errors).

## React / Next.js specifics

- `error.tsx` (Client Component) per segment with `reset()`; `global-error.tsx` replaces the root layout as the last resort; `not-found.tsx` with `notFound()`; `unauthorized()`/`forbidden()` helpers exist behind experimental flags in recent versions, check the installed one.
- Server Components that throw during render are caught by the nearest `error.tsx`; errors in Server Functions return state (`{ ok: false }`), they do not throw to the client (sensitive messages are stripped in production anyway).
- Client-side error boundaries (`react-error-boundary` or a class component) around independent widgets; TanStack Query `throwOnError` to route errors to them.
- `instrumentation.ts` `onRequestError` for server-side reporting; `instrumentation-client.ts` for client errors (check the installed Next version).

## Testing error paths

- Unit: the mapper (above) and `toFormErrors` with every kind.
- Component: MSW returning 401 (refresh once, then login), 403 (forbidden state, no retry loop), 404, 422 (fields), 500 (retry), network error and timeout (`http.get(url, () => HttpResponse.error())`, delayed responses); assert the rendered state and that no raw message leaks.
- E2E: one failure journey (backend down for a page) and the chunk-reload path after a deploy when the app is long-lived.
- Assert reporting: the error tracker mock receives one event per failure with the expected fingerprint.
