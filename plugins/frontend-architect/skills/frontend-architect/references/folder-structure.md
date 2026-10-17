# Folder structure

## Contents
- Rules that apply to both frameworks
- Nuxt 4: stage 0 and stage 1
- Next.js App Router: stage 0 and stage 1
- What each directory is for
- Import rules and how to enforce them
- Monorepo layout
- Naming

## Rules for both frameworks

- Organize by **business feature** once there is more than one business area. Framework folders (`pages`, `app` routes, `layouts`, `plugins`, `middleware`) stay thin and compose features.
- A feature owns everything that changes with it: components, composables or hooks, service, schemas, types, local store, tests.
- Shared code must be **domain-free** (UI primitives, formatting, the HTTP instance). Anything mentioning a business noun belongs to a feature.
- Do not create empty folders, `utils` dumping grounds, or a `types/` folder holding every type in the app. Types live next to the code that owns them.
- Each feature exposes a public `index.ts`. Other features import only from it.

## Nuxt 4

Nuxt 4 uses `app/` as the source directory, with `server/`, `shared/`, `public/` and `layers/` at the root. Check `nuxt.config` (`srcDir`, `future.compatibilityVersion`) on Nuxt 3 projects before assuming this layout.

### Stage 0

```
app/
├── app.vue
├── pages/
├── components/
└── composables/
server/api/          # only if the app owns backend endpoints (BFF)
nuxt.config.ts
```

### Stage 1

```
app/
├── app.vue
├── error.vue
├── pages/                     # thin: compose features, define page meta
│   └── orders/[id].vue
├── layouts/
├── middleware/                # route middleware (auth guards)
├── plugins/
│   └── api.ts                 # creates the HTTP instance per request and provides it
├── components/
│   └── ui/                    # domain-free primitives not covered by the UI library
├── composables/               # cross-feature, domain-free composables (auto-imported)
├── features/
│   ├── orders/
│   │   ├── index.ts           # public API of the feature
│   │   ├── components/
│   │   │   ├── OrderList.vue
│   │   │   └── OrderStatusBadge.vue
│   │   ├── composables/
│   │   │   └── useOrders.ts   # binds the service to Pinia Colada or useFetch
│   │   ├── orders.service.ts  # calls endpoints only
│   │   ├── orders.schemas.ts  # Zod/Valibot schemas + inferred types
│   │   ├── orders.store.ts    # only if client-owned shared state exists
│   │   └── __tests__/
│   └── catalog/
└── utils/                     # domain-free helpers (auto-imported)
shared/
├── types/                     # types shared by app/ and server/ (auto-imported)
└── utils/
server/
├── api/                       # Nitro endpoints (BFF, proxies, webhooks)
├── middleware/
└── utils/
layers/                        # optional local layers (see nuxt.md)
nuxt.config.ts
```

Auto-import facts to respect:
- `app/composables` and `app/utils` auto-import **top-level files only**; nested folders are not scanned unless added to `imports.dirs`.
- `app/components` registers nested components with a path prefix (`components/ui/Button.vue` → `<UiButton>`).
- `app/features/**` is **not** auto-imported. Import from features explicitly. This is deliberate: explicit imports make feature dependencies visible and enforceable. Do not add `features/**` to `imports.dirs`.

## Next.js App Router

### Stage 0

```
app/
├── layout.tsx
├── page.tsx
└── about/page.tsx
components/
lib/
```

### Stage 1

```
src/
├── app/                           # routing only; thin files composing features
│   ├── layout.tsx
│   ├── (marketing)/page.tsx       # route groups organize without affecting URLs
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   └── orders/
│   │       ├── page.tsx           # Server Component: fetch on the server
│   │       ├── loading.tsx
│   │       └── error.tsx
│   └── api/                       # Route Handlers (webhooks, BFF endpoints)
├── features/
│   └── orders/
│       ├── index.ts               # public API (client-safe exports)
│       ├── server.ts              # server-only exports (import 'server-only')
│       ├── components/
│       │   ├── OrderList.tsx      # Server Component by default
│       │   └── OrderFilters.tsx   # 'use client' leaf
│       ├── hooks/useOrders.ts     # TanStack Query hooks (client)
│       ├── orders.service.ts
│       ├── orders.schemas.ts
│       ├── orders.actions.ts      # 'use server' Server Functions
│       └── __tests__/
├── components/ui/                 # shadcn/ui components live here
├── lib/
│   ├── http/                      # HTTP instance factory
│   └── utils.ts
├── providers/                     # client providers (QueryClientProvider, theme)
└── proxy.ts                       # Next 16 request interception (was middleware.ts)
```

Keep server-only code (secrets, DB, privileged API keys) in files that import `server-only`, so importing them from a Client Component fails the build.

## What each directory is for

| Directory | Holds | Must not hold |
|---|---|---|
| `pages/` (Nuxt), `app/**/page.tsx` (Next) | Route params, page meta, composition of features | Business logic, direct HTTP calls in stage 1+ |
| `layouts/` | Page chrome | Data fetching for one feature |
| `middleware/` (Nuxt), `proxy.ts` (Next) | Route guards, redirects, header logic | Data loading for pages |
| `plugins/` (Nuxt), `providers/` (Next) | App-wide instances: HTTP client, query client, theme | Feature logic |
| `components/ui` | Domain-free primitives | Anything naming a business entity |
| `features/<x>/components` | Components of that feature | Imports from another feature's internals |
| `composables/` / `hooks/` | Reactive coordination, side effects | Raw endpoint URLs (that is the service's job) |
| `*.service.ts` | Endpoint calls, request/response mapping | Reactive state, UI concerns, toasts |
| `*.schemas.ts` | Runtime validation + inferred types | Logic |
| `*.store.ts` | Client-owned shared state | Copies of server data |
| `server/` (Nuxt), Route Handlers (Next) | BFF logic, secrets, proxies | Client code |
| `shared/` (Nuxt) | Types and pure utils used by app and server | Anything importing Vue or Nitro |

## Import rules and enforcement

1. `app`/`pages` may import features; features never import `pages`.
2. A feature imports another feature only through its `index.ts`.
3. `components/ui`, `lib`, `utils`, `shared` never import features.
4. Client code never imports server-only modules.

Enforce with dependency-cruiser (framework-agnostic, works for `.vue` and `.tsx`):

```js
// .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    {
      name: 'feature-internals-are-private',
      comment: 'Import another feature only through its index.ts',
      severity: 'error',
      from: { path: '^(app|src)/features/([^/]+)/' },
      to: {
        path: '^(app|src)/features/([^/]+)/',
        pathNot: ['^$1/features/$2/', '^(app|src)/features/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'shared-code-is-domain-free',
      severity: 'error',
      from: { path: '^(app|src)/(components/ui|lib|utils)/' },
      to: { path: '^(app|src)/features/' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' }, doNotFollow: { path: 'node_modules' } },
}
```

Run `npx depcruise app src --config .dependency-cruiser.cjs` in CI. `eslint-plugin-boundaries` is an alternative that reports in the editor; check its configuration format for the installed major version.

## Monorepo layout

```
apps/
├── web/            # Nuxt or Next app, stage 1 inside
└── admin/
packages/
├── ui/             # design system: tokens + components for ONE framework
├── tokens/         # framework-agnostic design tokens (CSS variables, JSON)
├── api-contracts/  # generated types/clients from OpenAPI, Zod schemas
└── config/         # shared tsconfig, eslint, prettier
pnpm-workspace.yaml
turbo.json          # or nx.json
```

Share contracts and tokens, not business logic. A "common" package that every app imports for domain code recreates a monolith with extra build steps.

## Naming

- Vue components: `PascalCase.vue`, multi-word (`OrderList.vue`). React components: `PascalCase.tsx`.
- Composables: `useX.ts`; hooks: `useX.ts`. Services: `<feature>.service.ts`. Schemas: `<feature>.schemas.ts`. Stores: `<feature>.store.ts`.
- Folders: `kebab-case`. Feature names: plural business nouns (`orders`, `patients`).
- Tests next to the code or in the feature's `__tests__/`, named `*.spec.ts` or `*.test.ts` consistently with the project.
