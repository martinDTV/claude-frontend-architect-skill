# Remote state, caching, realtime and synchronization

The query cache (Pinia Colada, TanStack Query) owns remote state; this reference covers keeping it correct when data changes under the user: invalidation, concurrency, races, live updates, tabs and offline.

## Contents
- Recap: who owns what
- Invalidation strategies
- Optimistic concurrency
- Race conditions in the UI
- Polling, SSE or WebSocket
- Reconnection and resync
- Cross-tab synchronization
- Offline
- SSR and realtime
- Cleanup
- Testing concurrency

## Recap: who owns what

Server-owned data lives in the query cache and nowhere else; client-owned state (selection, drafts, preferences) lives in local state or small stores; navigation state lives in the URL (`state-vue.md`, `state-react.md`). Synchronization problems almost always come from a second copy: a store mirroring query results, or a component caching a response in a `ref`.

## Invalidation strategies

| Strategy | Mechanism | Use for |
|---|---|---|
| Time-based | `staleTime` per domain (catalog: minutes; inbox: seconds); refetch on focus/reconnect | Everything, as the baseline |
| Mutation-based | After a mutation, invalidate the entity's list and detail keys; `setQueryData` with the returned entity | Your own writes (read-your-writes) |
| Event-based | A server push (SSE/WebSocket) says "order 42 changed"; the client invalidates `['orders', 'detail', 42]` and `['orders', 'list']` | Other users' writes, background jobs |
| Version-based | The server returns `ETag`/`version`; a cheap `HEAD`/conditional request tells if the cache is stale | Large payloads with rare changes |

Hierarchical keys (`pinia-colada.md`) make event-based invalidation one line. Push **invalidation hints**, not full entities, unless the payload is small and the ordering is guaranteed: hints keep the cache as the single source of truth.

## Optimistic concurrency

- The server stores a `version` (or uses `ETag`); updates send `If-Match: "<etag>"` or `{ version }`; a mismatch returns 409 (or 412).
- The UI on 409: show "This record was changed by someone else", offer "reload and reapply my changes" (keep the user's input in memory, refetch, show a diff for the fields that changed) rather than silently overwriting or discarding.
- Optimistic updates assume success; for fields where conflicts are plausible (shared schedules, inventory) prefer pessimistic saves with a row spinner.
- Idempotency keys for POSTs that may be retried (`api-clients.md`).

## Race conditions in the UI

| Race | Symptom | Fix |
|---|---|---|
| Stale response wins | Typing "ab" shows results for "a" | Latest-wins guard + cancel the previous request (below); query libraries do this per key automatically when the key includes the input |
| Key change during flight | Switching patient shows the previous patient's data for a moment | Reactive keys (getter) and `placeholderData` only when the previous data belongs to the same key; otherwise show loading |
| Double submit | Two orders created | Disable the button while `pending`, idempotency key, server-side uniqueness |
| Out-of-order mutations | Toggle on/off/on ends off | Serialize mutations per entity (queue), or send the desired final state, not deltas |
| Refetch during optimistic update | Optimistic value flickers back | `cancelQueries` for the key in `onMutate` (`pinia-colada.md`), invalidate in `onSettled` |
| Logout during requests | A response writes into a cache that now belongs to nobody | Clear caches and abort in-flight requests on logout; ignore responses whose tenant/user differs from the current one |

A reusable guard for imperative flows (search-as-you-type outside the query cache, map interactions, wizards):

```ts
// @verify vue:lib/async/latest.ts
/**
 * Guards against stale responses: only the most recent call may apply its result, and the
 * previous in-flight request is aborted. Use it wherever a user action (typing, changing a
 * filter, switching a tab) starts a request whose result must replace the previous one.
 */
export function createLatest<TArgs extends unknown[], TResult>(
  run: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
) {
  let current = 0
  let controller: AbortController | null = null

  return {
    /** Resolves with the result when this call is still the latest, or `{ stale: true }` otherwise. */
    async call(...args: TArgs): Promise<{ stale: false; value: TResult } | { stale: true }> {
      const ticket = ++current
      controller?.abort()
      controller = new AbortController()
      try {
        const value = await run(controller.signal, ...args)
        return ticket === current ? { stale: false, value } : { stale: true }
      } catch (error) {
        if (ticket !== current) return { stale: true }
        throw error
      }
    },
    cancel() {
      current++
      controller?.abort()
      controller = null
    },
  }
}
```

```ts
// @verify vue:lib/async/latest.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createLatest } from './latest'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('createLatest', () => {
  it('ignores a slow earlier response that arrives after a newer one', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const queue = [first, second]
    const seenSignals: AbortSignal[] = []
    const search = createLatest(async (signal, _q: string) => {
      seenSignals.push(signal)
      return queue.shift()!.promise
    })

    const p1 = search.call('a')
    const p2 = search.call('ab')
    second.resolve('results for ab')
    first.resolve('results for a') // arrives last, must not win

    expect(await p2).toEqual({ stale: false, value: 'results for ab' })
    expect(await p1).toEqual({ stale: true })
    expect(seenSignals[0]?.aborted).toBe(true)
    expect(seenSignals[1]?.aborted).toBe(false)
  })

  it('swallows errors of superseded calls and rethrows errors of the latest one', async () => {
    const run = vi.fn<(signal: AbortSignal, fail: boolean) => Promise<number>>(async (_s, fail) => {
      if (fail) throw new Error('boom')
      return 1
    })
    const latest = createLatest(run)
    const stale = latest.call(true)
    const fresh = latest.call(false)
    expect(await fresh).toEqual({ stale: false, value: 1 })
    expect(await stale).toEqual({ stale: true })
    await expect(latest.call(true)).rejects.toThrow('boom')
  })
})
```

Call `cancel()` on unmount (`onScopeDispose`, effect cleanup). Pass the `signal` to the HTTP client so the network request is actually aborted, not only ignored.

## Polling, SSE or WebSocket

| Need | Choice | Notes |
|---|---|---|
| Status that changes every few seconds for a few items | Polling with `refetchInterval` (back off when the tab is hidden) | Simplest, cache-friendly, works through any proxy |
| Server → client notifications, one direction | SSE (`EventSource`) | Auto-reconnect built in; text only; one connection per tab (HTTP/2 multiplexes). Check infrastructure: some API gateways cut long responses (for example a 30 s limit) and break SSE; then poll or move the stream to a different edge |
| Bidirectional, high frequency (collaboration, chat, live cursors) | WebSocket | Needs its own auth (cookie on upgrade or a short-lived token), heartbeats, and a reconnection protocol |
| Delivery guarantees, offline clients | Backend queue + polling or push notifications | The browser connection is never the system of record |

Whatever the transport, the handler translates events into cache operations (invalidate, `setQueryData`), and nothing else: no component subscribes to the socket directly.

## Reconnection and resync

- Exponential backoff with jitter; cap at 30 to 60 s; stop when the tab is hidden for long and resume on visibility.
- After reconnect, assume events were missed: refetch active queries (`refetchOnReconnect`) or ask the server for events since the last received id (`Last-Event-ID` for SSE).
- Surface state to the user only when it matters: a subtle "reconnecting" indicator for dashboards, nothing for background sync.
- Authentication expiry closes the connection: refresh the session, then reconnect; do not loop on 401.

## Cross-tab synchronization

- `BroadcastChannel` (VueUse `useBroadcastChannel`) for logout, login, tenant switch, cart changes, theme; `storage` events as a fallback.
- On a "logout" message: clear caches and stores, abort requests, redirect; on "tenant switched": same, then reload the tenant's bootstrap data.
- Shared `localStorage` across tabs means one tab's session changes affect the other: design for it instead of assuming one tab.
- Leader election (one tab owns the WebSocket, the others get events via `BroadcastChannel`) only when connection counts are a real limit.

## Offline

Most business apps need **offline-tolerant** (keep cached reads, disable or queue writes, clear feedback), not **offline-first**. Offline-first (field capture, clinical rounds without coverage) is a product decision with real cost: IndexedDB storage, an outbox of mutations with ids generated on the client, conflict policy (last-write-wins, field merge, manual), sync status UI, and encryption of sensitive data at rest. Write an ADR before adopting it, and keep it to the features that need it (stage 2 layered features in `architecture.md`).

## SSR and realtime

Connections are created on the client only (`onMounted`, `useEffect`, `.client` plugins); the server render uses the prefetched snapshot. Never open sockets or intervals in code that runs during SSR (they leak per request). In Nuxt, Nitro can serve SSE routes; on serverless platforms check execution time limits.

## Cleanup

Every subscription, interval, `EventSource` and `WebSocket` is closed on unmount, logout and tenant switch. `leak-patterns.mjs` reports creations without a visible cleanup; the fix is a cleanup function returned from the composable or the effect, or VueUse composables that dispose automatically.

## Testing concurrency

- Deferred promises (as in the test above) to control response order; never `setTimeout` races in tests.
- `vi.useFakeTimers()` for polling, debounce and backoff; `vi.advanceTimersByTimeAsync`.
- MSW with `delay()` to simulate slow responses and assert that the latest request wins.
- Query cache tests: a new `QueryClient`/Pinia per test with `retry: false`; assert on rendered states after invalidation, not on cache internals.
- E2E: Playwright `page.route` to delay or fail requests mid-journey; two browser contexts for cross-tab logout.
