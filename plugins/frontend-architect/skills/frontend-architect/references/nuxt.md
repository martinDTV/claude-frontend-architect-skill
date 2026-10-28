# Nuxt

Written against Nuxt 4. On Nuxt 3, check `future.compatibilityVersion` and the docs for the installed version before applying directory or API advice.

## Contents
- Conventions that matter
- Rendering: SSR, SSG, SPA, hybrid with route rules
- Data fetching: useFetch, useAsyncData, $fetch, custom fetch
- Runtime config and secrets
- Plugins, middleware, modules, layers
- Server routes (Nitro) and BFF
- SSR safety and hydration
- Errors
- Authentication

## Conventions that matter

- Source lives in `app/`; `server/`, `shared/`, `public/`, `layers/` and `modules/` are at the root.
- Auto-imports cover Vue APIs, Nuxt composables, top-level files in `app/composables` and `app/utils`, and `shared/utils` + `shared/types`. Nothing else. Import feature code explicitly (`folder-structure.md`).
- In plain `.ts` files outside auto-import directories, import Nuxt composables from `#imports` for clarity.
- `~` and `@` alias `app/`; `~~` and `@@` alias the project root.

## Rendering

Decide per route:

| Route type | Strategy | `routeRules` example |
|---|---|---|
| Marketing, docs, blog | Prerender (SSG) | `'/blog/**': { prerender: true }` |
| Content that changes hourly | Cached SSR (stale-while-revalidate) | `'/products/**': { swr: 3600 }` |
| Personalized, SEO-relevant | SSR | default |
| Authenticated dashboard, no SEO | Client-only | `'/app/**': { ssr: false }` |

`routeRules` in `nuxt.config.ts` also sets headers, redirects and CORS per route. Check the deployment target (Node server, static host, edge) supports the chosen rules.

Lazy loading and hydration: prefix components with `Lazy` to split them; use lazy hydration strategies (`hydrate-on-visible`, `hydrate-on-idle`, `hydrate-on-interaction`) on below-the-fold interactive components, after confirming support in the installed version. Wrap browser-only widgets in `<ClientOnly>` with a fallback of the same size.

## Data fetching

| Need | Use |
|---|---|
| Page data on SSR, used by that page | `useFetch(url)` or `useAsyncData(key, fn)` |
| Event handlers, mutations, non-reactive calls | `$fetch` (or the injected client) |
| Shared across components, invalidation, optimistic updates | Pinia Colada (`pinia-colada.md`) |

Rules:
- `useFetch`/`useAsyncData` are for setup-time loading. Never call them inside event handlers; use `$fetch` there.
- Give `useAsyncData` an explicit, unique key when the function is not inline-deterministic.
- Await them in `<script setup>` when the page needs the data for SSR; use `lazy: true` (or `useLazyFetch`) when the page can render a skeleton first.
- Use `pick` or `transform` to reduce payload size: everything returned is serialized into the HTML.
- Do not wrap `useFetch` results into Pinia. Use the returned refs, or move to Pinia Colada when the data is shared.

### Custom fetch instance (default choice when Axios is not justified)

```ts
// @verify nuxt:plugins/fetch.ts
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

  const http = $fetch.create({
    baseURL: config.public.apiBase,
    headers,
    retry: 0,
    async onResponseError({ response }) {
      if (response.status === 401) {
        await useNuxtApp().runWithContext(() => navigateTo('/login'))
      }
    },
  })

  return { provide: { http } }
})
```

```ts
// @verify nuxt:composables/useApiFetch.ts
import type { UseFetchOptions } from 'nuxt/app'

export function useApiFetch<T>(url: string | (() => string), options?: UseFetchOptions<T>) {
  return useFetch(url, { ...options, $fetch: useNuxtApp().$http })
}
```

Services then receive `useNuxtApp().$http` exactly as the Axios services receive `$api`. Keep services client-agnostic by typing the parameter as the minimal function they need, or accept the coupling and keep one client per app.

## Runtime config and secrets

- `runtimeConfig` top-level keys are **server-only**. `runtimeConfig.public` keys are sent to the browser.
- Override at runtime with `NUXT_` environment variables (`NUXT_API_BASE_SERVER`, `NUXT_PUBLIC_API_BASE`); no rebuild needed.
- Never put secrets in `public`, in `app.config.ts` (bundled), or in `import.meta.env` accessed from app code.

## Plugins, middleware, modules, layers

- **Plugins**: create per-app (per request on the server) instances and provide them. Keep them small; they run on every request. Order with `dependsOn` or numeric prefixes.
- **Route middleware** (`app/middleware`): navigation guards. Global ones end in `.global.ts`. They run on the server and the client: no browser APIs without `import.meta.client`.
- **Server middleware** (`server/middleware`): every Nitro request; for headers, logging, auth context.
- **Modules**: build-time integrations. Prefer official/community modules (`@pinia/nuxt`, `@pinia/colada-nuxt`, `@nuxt/ui`, `@nuxt/image`) over manual plugin setup.
- **Layers**: share a whole Nuxt app slice (components, composables, config, server routes) between apps. Local layers in `layers/` are registered automatically. Use them in a monorepo for a design system or a shared shell; not to split one app into folders.

## Server routes and BFF

`server/api/**` endpoints run in Nitro. Use them as a backend-for-frontend when you need to hide API keys, aggregate several backend calls, or set `HttpOnly` cookies. Validate input with `readValidatedBody(event, schema.parse)` and `getValidatedQuery`. Calls from the app to these routes with `$fetch('/api/...')` during SSR skip the network.

## SSR safety and hydration

- **No module-level mutable state** in anything that runs on the server. Use `useState` (per request), Pinia (per request when installed via `@pinia/nuxt`), or plugin-provided instances.
- `useState` values must be serializable.
- Hydration mismatches come from: `Date.now()`, `Math.random()`, locale or timezone formatting differences, `window`/`localStorage` reads during setup, and invalid HTML nesting (`<div>` inside `<p>`). Fix the cause; do not hide warnings.
- Browser-only code: `onMounted`, `import.meta.client`, `<ClientOnly>`, or `.client.vue` components.

## Errors

- `createError({ statusCode, statusMessage, fatal })` in pages and server routes; `showError` and `clearError` in the app.
- `app/error.vue` renders full-page errors; `<NuxtErrorBoundary>` isolates component-level failures.
- Never leak backend error bodies or stack traces into the rendered HTML.

## Authentication

Prefer an `HttpOnly`, `Secure`, `SameSite` cookie session set by the backend or a Nitro route. The browser sends it automatically; during SSR, forward it with `useRequestHeaders(['cookie'])` (as in the plugins above). Guard routes with middleware, but enforce authorization on the server: client guards are UX, not security. For OAuth/OIDC, use a maintained module (for example `nuxt-auth-utils` or a provider SDK) instead of hand-rolled token handling.

## Nitro in depth

- `server/utils/**` is auto-imported into server code: put `requireUser(event)`, `getTenant(event)` and the backend client there; never import them from `app/`.
- `event.context` carries per-request data set by `server/middleware` (session, tenant, request id); handlers read it instead of re-parsing cookies.
- Validation with h3 helpers: `readValidatedBody(event, schema.parse)`, `getValidatedQuery`, `getValidatedRouterParams`; invalid input becomes a 400 before business code runs.
- `defineCachedEventHandler`/`cachedFunction` cache responses in Nitro's storage with `maxAge` and `swr`; only for data that is identical for every user (never per-user or per-tenant responses unless the key includes the tenant and the privacy rules allow it).
- `useStorage()` abstracts KV stores (memory, filesystem, Redis, cloud KV via drivers); use it for caches and small state, not as a database.
- Nitro tasks (`server/tasks`, `experimental.tasks`) for scheduled or triggered work; check the installed version's status before relying on them in production.
- Streaming and SSE routes work in Nitro (`createEventStream`); verify the deployment target keeps long connections open (`realtime-and-sync.md`).
- Nitro presets change behavior (edge runtimes lack Node APIs): test the production preset, not only `nuxt dev`.

## Hydration debugging

Symptoms: "Hydration node mismatch" warnings, flashes, duplicated content, handlers attached to the wrong element.

| Cause | How to spot | Fix |
|---|---|---|
| Time, random, locale-dependent output | Warning points at a text node with a date, id or number | Compute on the server and pass down, use `useId()`, format with an explicit locale and zone (`i18n.md`) |
| Browser-only reads in setup (`window`, `localStorage`, `matchMedia`) | `ReferenceError` on the server or different first render | `onMounted`, `import.meta.client`, VueUse composables with SSR guards, cookies for SSR-relevant preferences |
| Invalid HTML nesting (`<div>` in `<p>`, `<a>` in `<a>`) | The browser repairs the DOM before hydration | Fix the markup; `nuxt devtools` and the Vue warning name the elements |
| Different data on server and client | A `useFetch` without a stable key, or client-only fetching mirrored on the server | Give explicit keys; do not refetch on mount what SSR already provided |
| `v-if` on client-only state (`isMobile`) | Layout jumps | Render both and switch with CSS, or `<ClientOnly>` with a same-size fallback |
| Third-party scripts mutating the DOM before hydration | Content disappears | Load them after hydration (`useScript` with a trigger) |

Procedure: reproduce with `nuxt build && nuxt preview` (dev mode hides some cases), open the console, follow the warning to the component, compare the SSR HTML (`view-source` or `curl`) with the client render. Do not silence warnings with `<ClientOnly>` wholesale; it hides the content from SSR and SEO.

## Lazy hydration and partial interactivity

Nuxt supports lazy hydration strategies on `Lazy` components (`hydrate-on-visible`, `hydrate-on-idle`, `hydrate-on-interaction`, `hydrate-on-media-query`, `hydrate-after`, `hydrate-when`, `hydrate-never`), built on Vue 3.5's lazy hydration. Use them for below-the-fold interactive blocks (comments, carousels, secondary charts) so the HTML arrives server-rendered and the JavaScript runs later. Verify availability and names in the installed Nuxt and Vue versions. Server components (`.server.vue`, `experimental.componentIslands`) render HTML with zero client JavaScript for static-but-dynamic blocks; treat them as experimental until the project's version documents them as stable.

## Large applications

Signals that a Nuxt app has grown past its conventions: `nuxt typecheck` or `nuxt build` above several minutes or out of memory on standard CI machines, dozens of flat auto-imported composables, pages above 800 lines, one `types/` file modeling every domain.

- Build memory: raise `NODE_OPTIONS=--max-old-space-size` as a stopgap; the fix is fewer giant chunks, lazy routes and smaller type-level explosions (`typescript.md`).
- Chunking: route-level splitting is automatic; heavy libraries behind `defineAsyncComponent`/`Lazy`; check with `nuxi analyze` and `bundle-budget.mjs`.
- Discipline: `components.dirs` only for shell and shared UI with explicit prefixes; `imports.dirs` not extended to domain code; domains under `features/` or `modules/` with explicit imports and an `index.ts` (`modular-monolith.md`); `dependency-cruiser` in CI.
- Layers (`nuxt-layers.md`) to share a base (session, API client, theme, shell) between several Nuxt apps or to extract a product-wide core; not to split one app into folders.
- Multiple teams: ownership per module (`CODEOWNERS`), contract checks between modules (`contracts-check.mjs`), and a reviewer for the shell.

## Sessions

`nuxt-auth-utils` (0.5.x, verified) provides sealed, `HttpOnly` cookie sessions for Nitro: `setUserSession`, `getUserSession`, `requireUserSession(event)` in server routes, `useUserSession()` on the client, and OAuth handlers for common providers. It stores the session in the cookie (encrypted) so it works without a session store, with a size limit; keep only ids and roles in it, not profiles. Session, token and multi-tenant design is in `auth-session-tenant.md`; the rule stays: the backend authorizes every call, Nuxt middleware only gates navigation.

## Apps with `ssr: false`

A client-only Nuxt app still has server code: Nitro routes, server middleware, plugins run once on the client only. Consequences:
- Module-level mutable state in `app/` (singleton caches, in-flight promise maps) is safe for now, and becomes a cross-request leak the day `ssr: true` or a layer reuses the code in an SSR app. `state-audit.mjs` lists these as low severity while `ssr: false`; keep them behind `useState` or Pinia anyway when cheap.
- The HTML is an SPA shell: no SEO, slower first paint; acceptable for authenticated panels. Mixed products use `routeRules` (`'/app/**': { ssr: false }`) and keep the public site server-rendered.
- Plugins run before route middleware, so hydrating a session store in a plugin makes the first-load guard work; with SSR the same code needs `import.meta.client` guards.
- `nuxt generate` produces `index.html`/`200.html`; the hosting must serve the shell for unknown paths and set `Cache-Control: no-store` for HTML, immutable for `_nuxt/**` (`deployment.md`).
