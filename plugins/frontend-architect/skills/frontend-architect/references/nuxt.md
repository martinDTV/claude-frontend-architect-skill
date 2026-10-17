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
