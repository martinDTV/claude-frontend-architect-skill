# Legacy modernization

Modernizing a frontend is risk management, not a rewrite. The order is always: understand, protect, then change in slices that ship. Framework migration is the last option, not the first (`decision-catalog.md`, D13).

## Contents
- Assessment first
- The safety net: characterization tests and visual regression
- Strangler fig for frontends
- Options API → Composition API
- Vue 2 → Vue 3
- Nuxt 2 → Nuxt 3/4 and Nuxt 3 → Nuxt 4
- Next.js Pages Router → App Router
- Create React App / Webpack → Vite or Next.js
- JavaScript → TypeScript
- Class components → hooks
- jQuery and legacy widgets inside Vue or React
- Feature flags and parallel run
- When not to migrate frameworks
- Estimating, sequencing and rollback

## Assessment first

Before proposing anything, produce an inventory with evidence (the plugin's scripts do most of it read-only):

| Question | How to answer |
|---|---|
| Exact versions and support status | `node_modules/<pkg>/package.json`, `ecosystem-status.md`, the project's own changelog |
| Size and shape | Lines per folder, pages and components over 400 lines (`component-complexity.mjs`) |
| Boundaries | Domain matrix and hotspots (`domain-deps.mjs`), modules with entries (`contracts-check.mjs`) |
| State and session | Stores, raw state keys, tokens in storage, module-level state (`state-audit.mjs`) |
| Routes and guards | `routes-audit.mjs` |
| Tests | What exists, what runs in CI, how long, how flaky |
| Build and deploy | One pipeline or several; build time; environment config baked or runtime |
| Risk map | Where money, personal data and permissions flow; what has no tests |
| Ownership | Who knows each area; what is undocumented |

Classify findings as **demonstrated** (file and line) or **hypothetical** (would be a problem if…), and rank by user impact, not by elegance (`auditing.md`).

## The safety net: characterization tests and visual regression

Legacy code has behavior nobody fully knows. Characterization tests capture what the code does today, right or wrong, so a change that alters it is visible:
- **Session and guards first**: login, refresh, logout, expired session, revoked permission, tenant switch. These break silently and expensively.
- **The three most valuable journeys** end to end on a production build (Playwright), against a seeded backend or recorded network.
- **Component tests by role and label** for the screens you are about to split, written against the current markup.
- **Visual regression** (Playwright screenshots or a Storybook-based tool) for screens whose layout must not move during a refactor; animations disabled in those runs.
- **Contract tests** against the backend's OpenAPI spec when one exists, so an API change is not mistaken for a refactor bug.

A reorganization without a net is a rewrite in disguise. Budget the net as part of the migration, not as a prerequisite someone else pays for.

## Strangler fig for frontends

Replace the old system from the outside in, keeping both alive until the new one covers everything:

| Level | Technique | Fits when |
|---|---|---|
| Route | A reverse proxy or the framework router sends some paths to the new app and the rest to the old one; shared session cookie on the same domain | Two different frameworks or major versions; a legacy app that cannot be upgraded in place (`microfrontends.md`, route-based composition) |
| Page | Inside one app, rewrite one page at a time behind the same URL; old and new pages coexist | Same framework, in-place upgrade (Options → Composition, Pages → App Router) |
| Component | Replace one component (a table, a form) with the new implementation; keep props and events compatible, or wrap the new one in an adapter | Design-system migrations, library swaps |
| Module | Move one business module to the new structure (`modular-monolith.md`), keep the rest | Structural modernization |

Rules: the old code is never modified except to delegate; every slice is deployable and reversible (a flag or a proxy rule); progress is measured as "percentage of traffic on the new path", not "percentage of files rewritten".

## Options API → Composition API

Both APIs coexist in Vue 3; migrate per component, starting with the ones you touch for other reasons.
- Order inside a component: `data` → `ref`/`reactive`; `computed` → `computed`; `methods` → functions; `watch` → `watch`; lifecycle hooks → `onMounted`…; mixins → composables (the main win); `this.$refs` → template refs; `provide/inject` typed.
- Keep `<script>` with `export default defineComponent({ setup() {} })` when a file still needs options (`inheritAttrs`, custom options), and switch to `<script setup lang="ts">` when it does not.
- Extract composables for logic shared by mixins before deleting the mixins; test the composable in isolation.
- Do not convert a component you are not otherwise changing unless it is on the critical path of a feature: conversions without tests are where regressions hide.

## Vue 2 → Vue 3

Vue 2 reached end of life on 2023-12-31; staying means no security fixes. Path:
1. Upgrade within Vue 2 to the last 2.7 release (it backports `<script setup>` and the Composition API), fix deprecations there.
2. Inventory dependencies: every Vue 2-only library (UI kits, Vuex plugins, filters) needs a Vue 3 equivalent or removal.
3. Use the migration build (`@vue/compat`) to run the app on Vue 3 with Vue 2 behavior flags, then switch flags off module by module. Check the compat build's support status for the installed Vue 3 minor.
4. Vuex → Pinia (setup stores), filters → functions, event bus → props/emits or a composable, `$children`/`$listeners` → explicit APIs.
5. Remove `@vue/compat` when no flag remains.

Timebox the inventory; the dependency list decides the effort more than the component count.

## Nuxt 2 → Nuxt 3/4 and Nuxt 3 → Nuxt 4

Nuxt 2 is end of life (June 2024). Nuxt Bridge was a transitional path; for a new effort, target Nuxt 4 directly and treat it as a Vue 2 → 3 migration plus a framework migration (Nitro server, `useFetch`/`useAsyncData`, new module system, Vite). Strangle by route when the app is large: a Nuxt 4 app for new routes behind the same domain, the Nuxt 2 app shrinking.

Nuxt 3 → Nuxt 4 is an in-place upgrade:
1. On Nuxt 3, set `future: { compatibilityVersion: 4 }` and fix what breaks (new `app/` source directory, data-fetching defaults, shallow reactivity of `useAsyncData` data, component name normalization, TypeScript project changes). The official guide lists each change with a flag to opt out temporarily.
2. Apply the official codemods where available (the upgrade guide documents the `codemod` recipes), then review the diff.
3. Upgrade the package to Nuxt 4, remove the `future` flag, update modules to versions that declare Nuxt 4 support (`ecosystem-status.md`).
4. Run `nuxt typecheck`, the test suite and the SSR concurrency check if SSR is on.

Expect the move to `app/` to be the largest mechanical diff; do it in its own pull request.

## Next.js Pages Router → App Router

The two routers coexist in one app; migrate route by route:
1. Shared providers and layouts first: a root `app/layout.tsx` and the providers Client Component; keep `pages/_app.tsx` for the old routes.
2. Pick leaf routes with little client state; rewrite them as Server Components fetching on the server, with small `'use client'` leaves.
3. `getServerSideProps`/`getStaticProps` → data fetching in the component and caching directives; API routes → Route Handlers or Server Functions (validate and authorize inside each).
4. `next/router` → `next/navigation` in migrated components; `middleware.ts` → `proxy.ts` on Next 16 (`nextjs.md`).
5. Delete `pages/` only when the last route moved; do not mix caching models across the boundary casually.

Module Federation users on the Pages Router: the App Router has no supported federation (`microfrontends.md`), so plan route-based composition before the last page moves.

## Create React App / Webpack → Vite or Next.js

Create React App is deprecated by the React team; a CRA app has three honest destinations:
- **Vite + React Router** when the app is a SPA and should stay one: replace scripts, move `index.html` to the root, change `process.env.REACT_APP_*` to `import.meta.env.VITE_*`, fix absolute imports and Jest → Vitest. Usually days, not weeks.
- **Next.js** when the app needs SSR/SEO or the team wants the framework's conventions: a real migration, done by route.
- **Keep Webpack** with an upgraded config when a plugin ecosystem (Module Federation, special loaders) ties you to it; still remove `react-scripts`.

Do not combine the build tool change with a framework change or a design-system change in one effort.

## JavaScript → TypeScript

Incremental, by configuration:
1. `tsconfig.json` with `allowJs: true`, `checkJs: false`, `strict: false`; rename nothing yet; make the build and editor understand both.
2. Enable `checkJs` per folder with `// @ts-check` or per-directory tsconfig `include`; fix the cheap errors.
3. Rename files to `.ts`/`.tsx` starting at the leaves (utils, services, schemas) where types are easiest; add runtime validation (Zod/Valibot) at the API boundary so inferred types are honest (`api-clients.md`).
4. Turn on strict flags one at a time (`noImplicitAny`, `strictNullChecks`, then `strict`), using `// @ts-expect-error` with a reason for debt you will not fix now; count them and burn them down.
5. Vue SFCs: `<script lang="ts">` per component; `vue-tsc` in CI. React: `.tsx` per component.

`any` as a migration shortcut is acceptable only with an inventory and a deadline; `unknown` with narrowing is preferable where the data is external.

## Class components → hooks

React class components still work; convert when touching them or when they hold logic you want to reuse. State → `useState`/`useReducer`; lifecycle methods → `useEffect` with correct dependencies and cleanup (`react.md`); HOCs and render props → custom hooks; `componentDidCatch` → keep one class-based error boundary (hooks cannot replace it yet) or use the framework's `error.tsx`. Convert leaves first; snapshot their behavior with Testing Library before and after.

## jQuery and legacy widgets inside Vue or React

Wrap, do not rewrite, until the widget is the next slice:
- Mount the legacy widget in a dedicated component that owns the DOM node (`ref`), initializes on mount, syncs props → widget API in watchers/effects, emits widget events as component events, and **destroys the widget on unmount** (the usual leak: listeners and timers the widget created; `leak-patterns.mjs` cannot see inside the library, so test it).
- Never let the framework and the widget both own the same DOM subtree.
- Load the legacy library only on the pages that need it (dynamic import).
- Plan the replacement when the wrapper's prop/event surface is understood; that surface is the specification for the new component.

## Feature flags and parallel run

- A flag per slice (route, page or component) selects old or new; flags are evaluated on the server when rendering matters, and defaults are the old path.
- Parallel run for calculations the frontend performs (totals, eligibility): compute with both implementations, show the old result, log mismatches to telemetry (`observability.md`) until the mismatch rate is zero for a representative period.
- Remove flags when a slice is fully rolled out; stale flags are legacy too.

## When not to migrate frameworks

Not reasons: "performance" without a profile that attributes the problem to the framework rather than to waterfalls, bundles, images or hydration cost (`performance.md`); "hiring"; "it is what the other team uses"; "modern"; an acquisition that brought another stack (compose by route instead); a consultant's preference.

Reasons: the framework or its major version is end of life with no supported upgrade path; a hard requirement is impossible in the current framework (a rendering model, a platform target, a mandated component ecosystem); the dependency graph is dominated by abandoned packages tied to the framework version; and in all cases an incremental route-by-route path with a safety net exists and the business accepts the cost.

A framework migration repeats the old architecture problems in a new syntax unless the structure is fixed first. Fix structure (`modular-monolith.md`) inside the current framework; if the migration still makes sense afterward, it will be cheaper.

## Estimating, sequencing and rollback

- Estimate by slices (routes, modules, components), each with: size, test coverage, dependencies on legacy-only libraries, and who knows it. The sum of slices plus the safety net is the estimate; a single number for "the migration" is a guess.
- Sequence: safety net → infrastructure (build tool, TypeScript config, providers/layouts) → leaf slices → core slices (session, navigation) last, when the pattern is proven.
- Ship every slice to production behind a flag or a proxy rule; a slice that sits unmerged for a month is a fork.
- Rollback is a flag flip or a proxy change, prepared before the slice ships, and tested once by actually flipping it.
- Track three numbers weekly: traffic on the new path, open regressions attributed to the migration, slices remaining. Stop and reassess when regressions outpace slices.
