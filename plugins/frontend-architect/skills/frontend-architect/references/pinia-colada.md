# Pinia Colada

Server-state cache for Vue and Nuxt (queries, mutations, invalidation, SSR). Verified against `@pinia/colada` 1.4.x and `@pinia/colada-nuxt` 1.2.x.

## Contents
- When to use it (and when useFetch is enough)
- The layer it occupies
- Queries and keys
- Mutations and invalidation
- Optimistic updates
- Pagination and infinite queries
- SSR and Nuxt
- Testing
- Anti-patterns

## When to use it

The official Nuxt guide for Pinia Colada draws the line, and this skill follows it:
- **`useFetch`/`useAsyncData`**: page-specific data not shared across components, one-off calls, no complex caching.
- **Pinia Colada**: data shared across components or pages, automatic invalidation and garbage collection, parallel requests, mutations with optimistic updates, stale-while-revalidate, deduplication.

Do not run both for the same data. Choose per domain and be consistent within it.

## The layer it occupies

```
Component → Composable (keys, options) → Pinia Colada → Domain service → HTTP client → Backend
```

The composable owns keys and cache policy; the service owns endpoints; Colada owns caching, deduplication, refetching and loading/error state. Full example with Axios: `axios.md`.

## Queries and keys

- Keys are arrays, hierarchical from general to specific: `['users']`, `['users', 'list', { limit, offset }]`, `['users', 'detail', id]`. Define them in one key factory per feature (`users.keys.ts`).
- Reactive keys: pass a getter (`key: () => userKeys.detail(toValue(id))`); the query refetches when it changes.
- Pass `signal` from the query context to the service so outdated requests are canceled.
- Tune `staleTime` per domain (catalog data minutes; notifications seconds). Set app-wide defaults in the plugin options (Nuxt: `colada.options.ts`).
- Use `enabled` to wait for prerequisites (for example `enabled: () => id.value != null`).
- Read `state` (a discriminated union: `pending`, `error`, `success`) and `asyncStatus` (`idle`, `loading`) to render every UI state. `data`, `error`, `isPending` are also available.
- `defineQueryOptions` describes reusable query options (static or parametrized) to share between `useQuery` calls and cache operations.

## Mutations and invalidation

- `useMutation({ mutation, onMutate, onError, onSuccess, onSettled })`.
- Invalidate in `onSettled` with the broadest correct key: `queryCache.invalidateQueries({ key: userKeys.lists() })`. Active queries refetch; inactive ones refetch on next use.
- When the mutation returns the updated entity, `setQueryData` on the detail key avoids an extra request.

## Optimistic updates

Use for fast, low-risk interactions (toggles, reorder, like). Always roll back on error and revalidate after.

```ts
// @verify vue:features/todos/useToggleTodo.ts
import { useMutation, useQueryCache } from '@pinia/colada'

export interface Todo {
  id: number
  title: string
  done: boolean
}

export const todoKeys = { all: ['todos'] as const }

export function useToggleTodo(save: (todo: Todo) => Promise<Todo>) {
  const queryCache = useQueryCache()

  return useMutation({
    mutation: (todo: Todo) => save({ ...todo, done: !todo.done }),

    onMutate(todo: Todo) {
      const previous = queryCache.getQueryData<Todo[]>(todoKeys.all)
      if (previous) {
        queryCache.setQueryData(
          todoKeys.all,
          previous.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)),
        )
      }
      queryCache.cancelQueries({ key: todoKeys.all })
      return { previous }
    },

    onError(_error, _todo, context) {
      if (context.previous) queryCache.setQueryData(todoKeys.all, context.previous)
    },

    onSettled() {
      queryCache.invalidateQueries({ key: todoKeys.all })
    },
  })
}
```

## Pagination and infinite queries

- Paginated lists: the page is part of the key; keep the previous page visible while loading the next with `placeholderData` (receives the previous data).
- Infinite scroll: `useInfiniteQuery` (or `defineInfiniteQueryOptions`). Prefer cursor-based backend pagination for feeds.
- Keep pagination state in the URL (`state-vue.md`, navigation state).

## SSR and Nuxt

- Install with `npx nuxi module add @pinia/colada-nuxt` (plus `@pinia/colada` and `@pinia/nuxt`). Queries in components are prefetched during SSR automatically and hydrated on the client; no `await` needed.
- Configure globally in `colada.options.ts` at the project root (typed with `satisfies PiniaColadaOptions`).
- The query function runs on the server during SSR: use the per-request client from the plugin (`useNuxtApp().$api`), never a module-level one.
- Payload size: everything cached during SSR is serialized into the HTML; avoid prefetching large lists the page does not render.

## Testing

Test services in isolation (`axios.md`). For composables and components, install Pinia and `PiniaColada` in the test app and mock the service function passed to the composable, or intercept HTTP with MSW. Assert on rendered states (loading, error, empty, data), not on cache internals.

## Anti-patterns

- Copying `data` into a Pinia store "to share it". The cache is already shared.
- Calling the service directly in components "because it is simpler" next to queries for the same data: two sources of truth.
- Non-hierarchical keys (`['getUsersPage1']`) that cannot be invalidated as a group.
- Catching errors inside the query function and returning `null`: the error state never shows.
- Optimistic updates without rollback, or on operations where failure is common (payments).

## Beyond the basics

Invalidation driven by server events (SSE/WebSocket hints), optimistic concurrency with versions and 409 handling, stale-response races outside the cache, cross-tab logout and offline queues are covered in `realtime-and-sync.md`. Error states and recovery flows (expired session, revoked permission, tenant switch) are in `error-handling.md`.
