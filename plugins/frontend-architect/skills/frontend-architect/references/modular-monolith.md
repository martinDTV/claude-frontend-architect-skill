# Modular monolith

The default architecture for enterprise frontends between roughly 20k and 200k lines: **one application, one build, one deploy, several business modules with enforced boundaries**. It keeps everything that a split would break (session, tenant, permissions, theme, navigation) in one place and makes a later split possible by proving the boundaries first. Stages and when to leave them: `architecture.md`. Alternatives and criteria: `decision-catalog.md`, `microfrontends.md`, `nuxt-layers.md`.

## Contents
- Boundaries by business capability
- The three layers: core, shell, modules
- What may cross a boundary
- Communication between modules
- Public contracts and their evolution
- Nuxt specifics
- Next.js specifics
- Enforcement
- An 80k-line Nuxt app, as found
- Incremental migration plan
- When to extract a shared package
- When the monolith stops fitting

## Boundaries by business capability

A module is a business capability as the users and the organization name it: *orders*, *billing*, *patients*, *scheduling*, *field operations*. It is **not** a backend service, a database, a page, or a React/Vue concept.

| Boundary drawn by | Result |
|---|---|
| Business capability | Changes land in one module; ownership is clear; the backend can be reorganized without touching the frontend tree |
| Backend microservice | Screens that aggregate several services (a project hub, a checkout) end up owning everybody; renaming a service renames the UI tree |
| Page or route | Shared logic duplicated per page; no home for rules used by several screens |
| Technical layer (`components/`, `composables/`, `types/`) | The stage-0 layout; works until the second developer and the tenth screen |

Test for a good boundary: a product manager can describe the module in one sentence, and most pull requests touch one module plus, sometimes, core.

Naming matters more than it seems. In the audited app below, a composable named after the sales module was the client for the project and contract endpoints that every operations screen used; 64 of 116 cross-module edges were that misnamed file and a types file. Rename and move before measuring coupling, or the measurement lies.

## The three layers: core, shell, modules

```
app/
├── core/            # session, tenant, permissions, HTTP client, error contract, i18n, theme tokens, formatters
├── shell/           # layouts, navigation (menu, breadcrumbs, search), guards, notifications bell: depends on core only
├── modules/
│   ├── orders/      # index.ts (public), components/, composables/, services, schemas, types, __tests__
│   ├── billing/
│   └── scheduling/
└── pages/           # thin: import from modules/<x> and compose; URLs never change because of structure
```

| Layer | May depend on | Must not depend on |
|---|---|---|
| core | third-party packages, framework | shell, modules |
| shell | core | modules (navigation data comes from core: a registry the modules fill, or a static table) |
| module | core, other modules **through their public entry only** | shell, pages |
| pages | modules, core, shell | nothing else; no business logic |

The shell needing a module is the most common violation and the most expensive one later: a route guard that calls a sales-permissions composable, a layout menu that asks a domain client for counts. Fix: the module publishes a domain-free contract (`can(action)`, `menuEntries()`, `badgeCount`) through core, or the data moves to the identity/permissions endpoint. `domain-deps.mjs` reports `shell-depends-on-domain`.

## What may cross a boundary

| Crosses freely | Crosses only through `index.ts` | Never crosses |
|---|---|---|
| Core types (`Money`, `Paginated<T>`, `ApiError`), core composables, UI primitives | A module's public components (`<OrderStatusBadge>`), public composables/hooks (`useOrderSummary`), public types (`Order`), route helpers (`orderPath(id)`) | Internal components, stores, services, schemas, raw `useState` keys, HTTP paths of another module |
| Navigation: any module may link to any URL | Read-only queries about another module's data (through its composable) | Mutations of another module's data (go through the backend or the owning module's action) |

A type imported from another module is still a dependency. When many modules need the same entity type (`Project`, `Person`), that type belongs to core or to the module that owns the concept, published explicitly, and not to whichever module declared it first.

## Communication between modules

1. **By navigation.** The URL is the contract: deep links, back button, bookmarks, notifications pointing to a screen. Route helpers exported from the owning module keep paths in one place.
2. **Through core.** Session, tenant, permissions, current context (selected project, workspace) live in core and are exposed as typed functions, never as raw store keys another module can mutate.
3. **Through published contracts.** `import { useOrderSummary } from '~/modules/orders'`; the import is explicit and visible to tooling.
4. **Through the backend.** A cross-module operation (an approved document releases a purchase; a converted lead creates a project) completes on the server; the client navigates or invalidates. Domain events belong to the backend, not to a browser event bus.

Forbidden: a browser-side event bus between modules (`mitt`, `window.dispatchEvent`) for business flows; a Pinia/Zustand store shared by several modules as their integration point; props that carry another module's internal objects into a component; a module reaching into another module's `useState('key')` by its string.

## Public contracts and their evolution

```ts
// @verify vue:modules/orders/index.ts
// Everything a module exposes, explicitly. Other modules import only from here.
export { useOrderSummary, type OrderSummary } from './composables/useOrderSummary'
export { orderPath } from './routes'
export type { Order, OrderStatus } from './types'

/** @deprecated since 2026-10: use `useOrderSummary`; removal planned for the next minor. */
export { useOrderSummary as useOrdersSummary } from './composables/useOrderSummary'
```

```ts
// @verify vue:modules/orders/composables/useOrderSummary.ts
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import type { Order } from '../types'

export interface OrderSummary {
  count: number
  totalCents: number
}

export function useOrderSummary(orders: MaybeRefOrGetter<readonly Order[]>) {
  return computed<OrderSummary>(() => {
    const list = toValue(orders)
    return { count: list.length, totalCents: list.reduce((sum, o) => sum + o.totalCents, 0) }
  })
}
```

```ts
// @verify vue:modules/orders/types.ts
export type OrderStatus = 'draft' | 'confirmed' | 'invoiced' | 'cancelled'
export interface Order {
  id: string
  status: OrderStatus
  totalCents: number
}
```

```ts
// @verify vue:modules/orders/routes.ts
export const orderPath = (id: string) => `/orders/${encodeURIComponent(id)}`
```

Rules for evolving a contract inside one repository:
- **Add** freely. **Rename or change** by adding the new export, marking the old one `@deprecated` with a date and a removal plan, migrating consumers (the compiler finds them), then removing in a later change. Never both in one commit when more than one team consumes the module.
- Keep a baseline of public surfaces and diff it in CI: `contracts-check.mjs --write-baseline contracts.json` once, `contracts-check.mjs --baseline contracts.json` on every pull request; a removed export fails the build until the baseline is updated on purpose.
- `export *` hides the surface; list exports explicitly.
- Public composables return readonly state where the consumer must not mutate (`readonly(ref)`, `computed`).
- Compatibility between versions matters even inside one deploy when modules are developed by different people: a pull request that changes a contract includes the consumers' migration.

## Nuxt specifics

- **Auto-import discipline.** Nuxt scans only the top level of `app/composables` and `app/utils` (plus `shared/utils` and `shared/types`) and registers every component under `app/components` with a path prefix. Code under `app/modules/<x>/composables` or `app/modules/<x>/components` is **not** auto-imported: moving a module there makes its dependencies explicit without touching `nuxt.config.ts`. That is the point. Do not add `modules/**` to `imports.dirs` or `components.dirs`; it recreates the implicit graph.
- Register only truly global component directories: `components: [{ path: '~/components/shell', pathPrefix: false }, '~/components']` (listing a custom dir replaces the default scan unless `~/components` is listed again; check the installed version's behavior).
- Core composables that every screen uses (`useSession`, `useCan`, `useApi`) may stay auto-imported in `app/composables`; everything named after a business noun moves to its module.
- `useState` keys: wrap each in one composable in the owning module or core; never spread the string.
- Pinia stores: one per business concern, defined in the module, auto-imported only if the stores dir is configured; prefer explicit imports from the module entry.
- Pages stay thin and keep their URLs: a page that is 1,000 lines becomes several module components, not several pages.
- Build and typecheck time grow with the project, not with the structure. Measure `nuxt typecheck` and `nuxt build` before and after a reorganization; if typecheck exceeds a few minutes, look at generated types, huge union types and barrel files that import everything before blaming the module layout.
- Server routes (`server/api/<module>/…`) follow the same ownership; shared Nitro utilities live in `server/utils`.

## Next.js specifics

- `src/features/<x>/` with `index.ts` (client-safe exports) and `server.ts` (`import 'server-only'`): a Client Component importing `server.ts` fails the build, which is the enforcement you want.
- Route groups (`app/(dashboard)/orders/page.tsx`) organize routing without changing URLs; the page composes feature components and passes server-fetched data down.
- Server Functions live in the feature (`orders.actions.ts`), validate and authorize inside; they are part of the module's public surface and therefore of its contract.
- Shared providers (query client, HTTP, theme) are core; features never create their own `QueryClient`.
- `'use client'` boundaries are per leaf; a feature exposes both server and client components and documents which is which.

## Enforcement

| Tool | Catches | Notes |
|---|---|---|
| dependency-cruiser | Explicit imports crossing internals, shell → module, cycles | Config in `folder-structure.md`; add rules for `core`/`shell` |
| eslint-plugin-boundaries | Same, in the editor | Check the config format for the installed major |
| `domain-deps.mjs` (this plugin) | Edges through Nuxt auto-imports and template components, matrix per domain, hotspots | Needs `.frontend-audit.json` to map folders to business domains in flat layouts |
| `contracts-check.mjs` (this plugin) | Missing entries, internal imports, module cycles, breaking changes vs baseline | Run on pull requests |
| `state-audit.mjs` (this plugin) | Stores shared across domains, raw `useState` keys, module-level state | |
| TypeScript `paths` | Nothing by itself; aliases like `#modules/orders` make entries convenient | Not a boundary |

Rules example for a `core/shell/modules` layout (dependency-cruiser):

```js
// .dependency-cruiser.cjs (excerpt)
module.exports = {
  forbidden: [
    { name: 'module-internals-are-private', severity: 'error',
      from: { path: '^app/modules/([^/]+)/' },
      to: { path: '^app/modules/([^/]+)/', pathNot: ['^app/modules/$1/', '^app/modules/[^/]+/index\\.ts$'] } },
    { name: 'core-and-shell-do-not-import-modules', severity: 'error',
      from: { path: '^app/(core|shell|components/ui|utils)/' }, to: { path: '^app/modules/' } },
    { name: 'modules-do-not-import-shell-or-pages', severity: 'error',
      from: { path: '^app/modules/' }, to: { path: '^app/(shell|pages|layouts|middleware)/' } },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' }, doNotFollow: { path: 'node_modules' } },
}
```

Start with `severity: 'warn'` on a legacy codebase, record the count, forbid new violations, then switch to `error` when the count reaches zero.

## An 80k-line Nuxt app, as found

Facts from a read-only audit of a Nuxt 4 back-office application (October 2026), useful as a calibration of what "stage 1.5" looks like:

- 279 files, 80,633 lines under `app/`; 83 pages, 15 of them above 800 lines, the largest 2,765; a 1,245-line default layout holding menu, breadcrumbs, command palette, notifications and project index.
- 46 flat, auto-imported composables; no `index.ts` anywhere; two explicit component imports in the whole project. Any screen could call any client without an import revealing it.
- 116 cross-domain edges in the graph; 64 went through one 1,473-line types file and one composable with a misleading name; after mentally moving both to core, 52 remained, 8 of them type-only, most of them legitimate business dependencies.
- The shell depended on one domain for permissions; the project hub used nine domain clients from one page.
- 17 `useState` keys, 4 module-level caches, 1 Pinia store, tokens in `localStorage`; logout cleared most but not all caches.
- No application tests; CI ran lint, typecheck and build.

The recommended path was not microfrontends (one developer, one pipeline, no release coupling) but exactly this document: rename and move the misplaced core code, introduce `modules/<x>/index.ts`, make the shell depend on a permissions contract, add dependency rules at `warn`, put characterization tests around session and guard, and only then refactor the largest pages. Measured criteria to reopen the microfrontend question were written down (`microfrontends.md`).

## Incremental migration plan

1. **Safety net first.** Characterization tests for the session core, guards and the two or three most valuable journeys (`testing-scenarios.md`); typecheck green; a bundle size baseline (`bundle-budget.mjs`).
2. **Measure.** `domain-deps.mjs --suggest-config`, then a real `.frontend-audit.json`; record the matrix, hotspots and shell dependencies as the baseline.
3. **Fix names and homes.** Move misplaced core code (types, identity client, error helpers) to `core/`; rename composables after what they serve. No behavior change; pull request per move.
4. **Create entries.** For each module, an `index.ts` that re-exports what others already use (the graph tells you). Consumers switch to the entry. Rules at `warn`.
5. **Make the shell domain-free.** Replace domain calls in layouts, middleware and plugins with core contracts.
6. **Move files.** Module by module, into `modules/<x>/`; in Nuxt this converts auto-imports into explicit imports (expect a large mechanical diff; do it per module, typecheck between moves).
7. **Rules to `error`.** When a module has zero violations, enforce it.
8. **Then split pages.** Oversized pages become module components with tests; URLs unchanged.
9. **Keep the baseline.** `contracts-check.mjs --baseline` in CI; review the matrix quarterly.

Each step ships independently. Do not combine a move with a behavior change.

## When to extract a shared package

Extract `packages/base` (or a Nuxt layer) when a **second deployable actually exists** and duplicates core code: a platform admin panel copying the session store, the API plugin, the guard and the error contract from the main app is the signal. Before that, a package is a build step with one consumer. After it: version it, give it an owner, and consume it from both apps (`nuxt-layers.md`, `folder-structure.md` monorepo layout).

## When the monolith stops fitting

Not when it is big. When:
- two or more teams own separate business areas end to end and block each other's releases in practice,
- an area needs a different technology or rendering model,
- a contract or tenant requires that code of other modules is not even served,
- or a legacy app must be strangled from outside.

Then read `microfrontends.md`: the prerequisites are exactly the outputs of this document (clean boundaries, a base package, contract tests, one pipeline, observability per app). A modular monolith is the shortest path to microfrontends if they ever become justified, and the best place to stay if they do not.
