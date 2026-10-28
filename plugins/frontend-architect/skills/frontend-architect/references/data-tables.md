# Data tables

Enterprise frontends live in tables. The decisions that matter are made before the first `<tr>`: who paginates, where the table's state lives, and whether you build one table component or forty.

## Contents
- One table component, many column configs
- The server contract
- URL as the table state
- The `useServerTable` composable or hook
- Column definitions and libraries
- Virtualization
- Selection and bulk actions
- Inline editing and optimistic rows
- Exports
- States, density and responsive behavior
- Vue / Nuxt specifics
- React / Next.js specifics
- Column settings and user preferences
- Accessibility
- Performance pitfalls
- Testing
- Checklist

## One table component, many column configs

Forty hand-written `<table>` blocks with their own pagination bar, sort arrows and empty state is a maintenance smell (`component-complexity.mjs` will surface it). Build or adopt one table component that takes rows, column definitions and a state object, and renders loading, empty, error and partial states consistently. Feature code declares columns and cell renderers; it never reimplements pagination.

## The server contract

| Concern | Recommendation |
|---|---|
| Pagination | Offset (`limit`, `offset`) for admin tables with page numbers and small totals; cursor (`after`, `limit`) for feeds and large or frequently changing tables |
| Sort | `sort=field:asc,field2:desc` or `ordering=-created_at` (follow the backend); always add a tiebreaker (`id`) so pages are stable |
| Filters | Explicit, typed query params; no free-form `q` JSON; arrays as repeated params or comma lists, consistently |
| Totals | `total` is expensive on big tables: make it optional (`include_total=1`) or return `has_more` |
| Response | `{ items, total?, limit, offset }` or `{ items, next_cursor }`; validated with a schema (`api-clients.md`) |
| Caching | Pinia Colada / TanStack Query keys include every param; `staleTime` per domain |

Agree the contract with the backend once and write it down next to the API docs; if the backend follows this plugin's companion `fastapi-architect` skill, its pagination contract is compatible.

## URL as the table state

Page, sort, filters, and selected tab live in the URL (`state-vue.md`, navigation state): links are shareable, back works, refresh restores. The composable reads them (`useRoute().query`, `useSearchParams`/`nuqs`) and writes with `router.replace` for filter changes (no history spam) and `router.push` for page changes if the product wants back-navigation between pages. Parse and validate the query with the same schema used for the request (defaults for missing values, clamp page sizes).

## The `useServerTable` composable or hook

Responsibilities, in this order:
1. Parse URL → typed params (schema with defaults).
2. Debounce text filters (300 ms); apply other filters immediately; reset page to 1 when filters change.
3. Query the cache with a hierarchical key (`['orders', 'list', params]`), passing `signal` so superseded requests are canceled.
4. Keep the previous page visible while the next loads (`placeholderData` in Pinia Colada and TanStack Query) to avoid layout jumps.
5. Expose `rows`, `total`, `state` (discriminated), `params`, and setters (`setSort`, `setPage`, `setFilter`), plus `refetch`.
6. Selection and bulk actions as a separate composable (below).

Vue sketch (shape, not a library): `const params = computed(() => parseTableQuery(route.query))`; `const { state, asyncStatus } = useQuery({ key: () => orderKeys.list(params.value), query: ({ signal }) => orders.list(params.value, { signal }), placeholderData: (prev) => prev })`. React: the same with `useQuery({ queryKey, queryFn, placeholderData: keepPreviousData })` and `nuqs` for params. Check option names against the installed versions of `@pinia/colada` and `@tanstack/*-query`.

## Column definitions and libraries

| Need | Vue / Nuxt | React / Next.js |
|---|---|---|
| Headless table logic (sorting, grouping, column sizing, selection state) | `@tanstack/vue-table` 9.x | `@tanstack/react-table` 9.x |
| Styled table with the project's design system | Nuxt UI `UTable` (built on TanStack Table; check its props for the installed `@nuxt/ui` 4.x), PrimeVue `DataTable` for very feature-rich needs | shadcn/ui table + TanStack Table, MUI Data Grid or AG Grid for spreadsheet-like needs |
| Simple read-only list | Semantic `<table>` with your table component | Same |

TanStack Table 9 is current (verified 9.3.1); its API changed from v8 in places: verify `useVueTable`/`useReactTable` options and column helper names against the installed version's docs, do not copy v8 snippets. Keep server-side mode (`manualPagination`, `manualSorting`, `manualFiltering`) when the server paginates; the table library must not re-sort a page.

Column definitions live next to the feature (`orders.columns.ts`): accessor, header label (translated), cell renderer, width hints, alignment (numbers right), sortable flag mapping to the server's sort field name. Cells render domain components (`<OrderStatusBadge>`), not inline markup soup.

## Virtualization

Virtualize when more than roughly 200 rows are rendered at once, when cells are heavy (components with watchers), or when the product needs infinite scroll. Tools: `@tanstack/vue-virtual` / `@tanstack/react-virtual` 3.x, VueUse `useVirtualList`. Requirements: fixed or measured row heights, a scroll container with a known height, and an accessible fallback (a reachable "load more" or pagination for keyboard and screen reader users). Server pagination with 25 to 100 rows per page removes the need in most admin tables.

## Selection and bulk actions

- Selection state is client state owned by the table composable: a `Set` of ids plus an `allAcrossPages` flag.
- "Select all" on a page selects visible rows; "Select all N results" switches to server-side semantics: the bulk action sends the filter, not the ids. Make the difference explicit in the UI.
- Bulk actions call a mutation with ids or filter, show progress for long operations, report partial failures row by row, and invalidate the list afterwards.
- Clear the selection when filters change; keep it across pages only when the product needs it and the UI shows the count.

## Inline editing and optimistic rows

- Edit one cell or one row at a time; Escape cancels, Enter saves, Tab moves.
- Optimistic update for low-risk fields (status, assignee): update the cached page, roll back on error, invalidate on settle (`pinia-colada.md`). For money or medical data: pessimistic, with a row spinner.
- Concurrency: send the row's version/ETag; a 409 shows "changed by someone else" with a reload action (`realtime-and-sync.md`).

## Exports

- Small results (a page, a few hundred rows): client-side CSV from the rows already loaded.
- Large results: the server generates the file (job + download link or streamed CSV); the client sends the current filter, never the ids of thousands of rows.
- Excel generation in the browser (`exceljs`, `xlsx`) is heavy: lazy-load it only on the export action (`bundle-budget.mjs` reports it as a large chunk; that is fine if it is lazy).

## States, density and responsive behavior

- Loading: skeleton rows with the final column widths; keep the header. Empty: say why (no data vs no matches) and offer the next action (clear filters, create). Error: message and retry. Partial: show rows with a banner when one of several sources failed.
- Density: data-entry tables want compact rows (32 to 36 px) and tabular numerals; occasional-use tables can be comfortable. Visual rules live in the creative skill's `enterprise-ui-patterns.md`.
- Responsive: below the tablet breakpoint either a card list of the essential columns, horizontal scroll with a sticky first column, or a column-priority system (hide low-priority columns first). Never shrink text below 14 px to fit.

## Vue / Nuxt specifics

- `useServerTable` as a composable in `shared/table/` (domain-free) taking the key factory, the service function and the query schema; features call `useServerTable(orderKeys.list, (params, { signal }) => orders.list(params, { signal }), orderQuerySchema)`.
- Params from `useRoute().query`, writes with `useRouter().replace({ query })`; a `computed` params object becomes the reactive key of `useQuery` (getter keys refetch automatically, `pinia-colada.md`).
- Debounce text filters with VueUse `refDebounced`/`useDebounceFn`; page resets inside the setter, not in a watcher chain.
- Rows in `shallowRef` (or straight from `state.data`, which Pinia Colada keeps shallow); cell components receive plain props.
- Nuxt UI `UTable` for the styled table: pass `:data`, `:columns` (TanStack column defs), `v-model:sorting` with `manualSorting`, and render cells through the `#<column>-cell` slots or `cell` renderers; check the slot and prop names for the installed `@nuxt/ui` 4.x. For projects without Nuxt UI, `@tanstack/vue-table` `useVueTable` plus your table component.
- SSR: paginated list pages can be server-rendered with the first page in the payload (`useQuery` prefetches during SSR with `@pinia/colada-nuxt`); mark private tables `ssr: false` via `routeRules` when they are behind authentication and SEO is irrelevant.

## React / Next.js specifics

- Server-rendered first page: the Server Component reads `searchParams` (await them, Next 15+), fetches page 1 with `fetch` and renders the table; interactivity (sort, filter) is a client leaf that updates the URL with `nuqs` and re-renders through navigation, or hydrates a TanStack Query cache (`HydrationBoundary`) for a fully client-driven table with polling.
- `useServerTable` as a hook over `useQuery` with `queryKey: orderKeys.list(params)`, `placeholderData: keepPreviousData`, `queryFn: ({ signal }) => ...`.
- `@tanstack/react-table` `useReactTable` with `manualPagination`/`manualSorting`; memoize `columns` and `data` (`useMemo`) or the table re-initializes on every render; shadcn/ui's data-table recipe follows this shape.
- Row selection and column visibility are table state owned by the hook, not by a global store; persist column preferences per user (below).

## Column settings and user preferences

Column visibility, order and width chosen by the user are **persistent client state** (`persistence.md`): store them per table id in the preferences store with a version (`orders-table:v2`), validate on read against the current column list (columns get renamed), and never persist filters that contain data (patient names) in `localStorage`. Density (compact/comfortable) is a global preference. Saved views (named filter sets) are server-side entities shared by the team, not browser storage.

## Accessibility

- Real `<table>`, `<thead>`, `<th scope="col">`; a caption or an `aria-labelledby` heading.
- Sortable headers are buttons inside `<th>` with `aria-sort="ascending|descending|none"` on the `<th>`.
- Row actions reachable by keyboard and named (`aria-label="Edit order 1042"`); do not hide actions behind hover only.
- Selection checkboxes with labels; announce bulk-action results in a live region.
- Pagination as navigation (`<nav aria-label="Pagination">`) with current page marked (`aria-current="page"`).
- Virtualized or infinite tables keep a keyboard path to all data (pagination or "load more").

## Performance pitfalls

- Deep reactivity on thousands of rows: in Vue keep the page in `shallowRef` and replace it; avoid `reactive([])` of entities. In React, memoize column definitions and row renderers; selector-based subscriptions for selection state so one checkbox does not re-render the table.
- One component per cell times 50 columns times 100 rows is 5000 instances: render plain text for simple cells, components only where needed.
- Formatters (`Intl.NumberFormat`, `DateTimeFormat`) are expensive to construct: create once per locale and reuse.
- Filters typed into the URL on every keystroke flood history and the server: debounce and `replace`.
- Table libraries re-sorting server pages, or client filtering on top of server filtering, produce inconsistent results: pick one side per concern.

## Testing

- Unit: query parsing (defaults, clamping, invalid values), key factories, selection semantics (page vs all), column config (sort field mapping).
- Component: with MSW serving the contract, assert rows render from the response, sort changes the request params, empty and error states appear, and the previous page stays visible while loading.
- E2E: one journey per critical table (filter, sort, paginate, bulk action) and `axe` on the page.
- Visual regression only for the shared table component, not for every feature table.

## Checklist

- [ ] One table component; features only declare columns
- [ ] Server paginates, sorts and filters; the client never re-sorts a page
- [ ] Page, sort and filters in the URL; `replace` for filters, debounced text
- [ ] Stale requests canceled (`signal`), previous page kept while loading
- [ ] Loading, empty (why), error (retry) and partial states
- [ ] Selection semantics explicit (page vs all results); bulk actions report partial failures
- [ ] Exports server-side above a few hundred rows; Excel libraries lazy-loaded
- [ ] `<th scope>`, `aria-sort`, named row actions, keyboard path to every row
- [ ] Rows shallow (Vue) or memoized (React); formatters created once
- [ ] Column preferences versioned and validated; no data in persisted filters
