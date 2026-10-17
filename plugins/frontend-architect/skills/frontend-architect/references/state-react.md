# State in React and Next.js

## Contents
- Classify first (same taxonomy as Vue)
- Decision matrix
- Tools: when each one fits
- Next.js specifics
- Anti-patterns

## Classify first

Use the same classification as `state-vue.md`: local UI, shared client, remote server state, derived, form, auth, persistent, normalized, cross-tab, navigation, temporary. Each kind has a different home.

## Decision matrix

| Kind of state | Default |
|---|---|
| Local UI | `useState` / `useReducer` |
| Derived | Computed during render (no state) |
| Navigation (filters, page, tab) | URL search params (`useSearchParams`, `nuqs` for typed params) |
| Server data in Server Components | Fetch on the server; no client state at all |
| Server data on the client | TanStack Query |
| Shared client state, small app | Context + `useReducer` |
| Shared client state, many consumers or frequent updates | Zustand (selectors avoid re-renders) |
| Large app with strict conventions, complex client workflows, time-travel debugging needs | Redux Toolkit (and RTK Query if you choose Redux for server state too) |
| Many small independent atoms with derived graphs (editors, canvases) | Jotai |
| Forms | `useActionState` or React Hook Form |
| Persistent preferences | Zustand `persist` or cookies (`persistence.md`) |

## Tools

- **TanStack Query**: server cache with deduplication, retries, invalidation, optimistic updates, infinite queries, SSR hydration. Keys in a factory per feature; services from `axios.md` or `fetch`. One `QueryClient` per browser session and per server request (pattern in `axios.md`).
- **Zustand**: minimal API, selectors (`useStore((s) => s.count)`), middleware (`persist`, `devtools`). Slices per feature, not one store for everything.
- **Redux Toolkit**: justified by organizational needs (many teams, strict patterns, devtools) more than technical ones. If adopted, use RTK Query instead of adding TanStack Query for the same data.
- **Jotai**: atomic state; good for fine-grained derived state. v3 is current (verified); check migration notes when upgrading from v2.
- **Recoil**: last published 2024-02 (verified). Treat as unmaintained; do not use in new code, plan migration in existing code (Jotai is the closest model).
- **Context**: dependency injection and low-frequency values. Not a high-frequency state container.

## Next.js specifics

- A module-level store (Zustand `create`, Redux `configureStore` at module scope) is shared across all requests on the server. For stores that render on the server, create them per request in a provider (`useState(() => createStore())`) and pass initial data from the Server Component.
- Prefer passing server-fetched data as props over hydrating it into a client store.
- Client-only stores (preferences, UI) are fine at module level if they never hold per-user data during SSR.

## Anti-patterns

- Copying TanStack Query data into Zustand or Redux.
- Redux for a five-screen CRUD app; Zustand for server data; Context for values that update on every keystroke.
- Storing derived values (totals, filtered lists) next to their sources.
- Global state for form fields.
