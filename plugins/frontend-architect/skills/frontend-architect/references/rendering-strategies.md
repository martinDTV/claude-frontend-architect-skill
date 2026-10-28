# Rendering strategies

How a route turns into HTML and JavaScript decides its SEO, first paint, freshness, hosting cost and failure modes. Decide **per route**, not per app. Framework specifics: `nuxt.md`, `nextjs.md`. Caching in depth: `performance.md`. Trade-off format for the whole decision: `decision-catalog.md`.

## Contents
- Vocabulary
- Decision procedure per route
- Strategies compared
- Partial rendering and streaming
- Islands architecture
- Hydration: what it costs and how to measure it
- Client-only applications (`ssr: false`)
- Caching layers and how they compose
- Nuxt specifics
- Next.js specifics
- Pitfalls

## Vocabulary

| Term | Meaning | HTML produced | JavaScript needed to show content |
|---|---|---|---|
| CSR / SPA | Browser renders everything; server sends an empty shell | At request time, empty | All of it |
| SSR | Server renders HTML per request, client hydrates | Per request | Hydration bundle |
| SSG / prerender | HTML rendered at build time | At build | Hydration bundle (or none for static content) |
| ISR / SWR | Prerendered or cached HTML served stale while a fresh copy is regenerated | At build or first request, then on a timer or on demand | Hydration bundle |
| Hybrid | A different strategy per route in one app | Mixed | Mixed |
| Streaming | The server flushes HTML in chunks; slow parts arrive later inside placeholders | Progressive | Hydration bundle |
| Partial prerendering | A static shell is served instantly; dynamic holes stream in | Shell at build, holes at request | Hydration bundle |
| Islands | Static HTML with isolated interactive components that hydrate independently | At build or request | Only the islands' code |
| Server components | Components that run only on the server and ship no client code | Per request or cached | None for those components |

## Decision procedure per route

Answer these in order; the first "yes" that forces a strategy usually decides it.

| Question | If yes |
|---|---|
| Must crawlers and link previews see the content? | SSR, SSG or ISR. Never CSR for the content itself |
| Is the content identical for every visitor and stable for hours or more? | SSG / prerender, with on-demand revalidation if it changes |
| Identical for everyone but changes every few minutes? | ISR / SWR with a TTL matched to the acceptable staleness |
| Personalized (session, tenant, permissions) and must be indexed? | SSR per request, `Cache-Control: private`, no shared cache |
| Behind authentication, no SEO, heavy interaction (dashboards, editors, back office)? | CSR for the route (`ssr: false` per route in Nuxt; a thin server page rendering a client component tree in Next.js) or SSR only if first paint on slow devices matters |
| Is the first contentful paint budget tight on mid-range phones over 4G? | Server-rendered HTML (SSR/SSG) plus a small hydration bundle; measure, do not assume |
| Does the page depend on a slow upstream (reports, aggregations)? | Stream it: render the shell, suspend the slow part |
| Does the audience include corporate networks with aggressive proxies or JavaScript disabled? | Server-rendered content; interactivity as enhancement |

Record the result as a table of routes → strategy → cache rule → why. In Nuxt it becomes `routeRules`; in Next.js it becomes the segment's data access pattern (static, cached or dynamic) and cache directives.

## Strategies compared

| Strategy | Context | Costs | Benefits | Risks | Anti-patterns | Adopt when |
|---|---|---|---|---|---|---|
| CSR / SPA | Authenticated apps, internal tools, editors | Blank first paint, everything depends on JavaScript, no SEO, large initial bundle unless split | Simplest hosting (static files), no server-side state, cheapest to operate, module-level state is per browser | Slow devices suffer; "it works on my machine" performance | Marketing or content behind CSR; SPA for a blog | No SEO need, users are logged in, interaction dominates |
| SSR | Content with personalization or freshness, e-commerce, public apps | A server per request, per-request safety rules (no shared mutable state), hydration cost, infra and cost scale with traffic | Fast first paint, SEO, works before hydration | Cross-request leaks, hydration mismatches, server as a single point of failure | SSR for a dashboard nobody indexes; SSR that waits for 6 sequential upstream calls | SEO or first paint matter and content differs per request |
| SSG | Docs, marketing, blogs, catalogs that change rarely | Build time grows with pages; stale until rebuilt or revalidated | Fastest, cheapest, most robust | Thousands of pages → long builds; dynamic data baked in by mistake | Prerendering personalized pages | Content is public and stable |
| ISR / SWR | Catalogs, news, listings with many pages | Cache invalidation logic; first visitor of a stale page may wait or see stale | SSG speed with freshness; no full rebuilds | Serving one user's data to everyone when a personalized value leaks into a cached page | `swr` on routes that read cookies | Public, same for everyone, changes on a schedule or on events |
| Hybrid | Any product with marketing + app | Two mental models in one repo; route rules to maintain | Each route gets the right strategy | Misconfigured rule caches private HTML | Copying one rule to all routes | Default for products with public and private areas |
| Streaming | Pages with one slow section | Needs boundaries designed in; layout shift if placeholders have no size | Shell visible immediately; slow part does not block | Boundaries placed too high (whole page waits) or too low (dozens of spinners) | Streaming as a fix for sequential waterfalls | A section depends on an upstream slower than ~300 ms |
| Islands | Content-heavy sites with sparse interactivity | Not how Nuxt or Next.js apps are built end to end; a different framework (Astro) is the reference implementation | Near-zero JavaScript for static content | Adopting a new framework for one landing page | Rewriting an app to "get islands" | Content sites, docs, marketing where interactivity is rare |
| Server components (Next.js) | Data-heavy pages with little client state | Boundary discipline (`'use client'` leaves), serializable props, new testing approach | No client JavaScript for data display; secrets stay on the server | `'use client'` on layouts; passing non-serializable props | Server components for an editor that is 90% client state | Default in Next.js App Router; push client code to leaves |

## Partial rendering and streaming

**Universal**: identify the slow dependency, wrap only that subtree in a suspense boundary with a placeholder of the final size (no layout shift), and keep the rest static or fast. Avoid nested boundaries deeper than two levels; measure the fallback flash on fast connections (a fallback that shows for 40 ms is worse than none).

**Nuxt**:
- `useLazyAsyncData` / `useFetch({ lazy: true })` render the page shell during SSR and resolve data on the client; the HTML does not contain the data (no SEO for that part). Use for below-the-fold or personalized widgets.
- `<Suspense>` is used internally by `<NuxtPage>`; page-level awaits block the page. Split slow data into child components that fetch lazily.
- Server components and islands (`.server.vue` components, `<NuxtIsland>`, `experimental.componentIslands`) render on the server without client JavaScript. They are **experimental**: check the installed version's docs and the open issues before building a product on them.
- Lazy hydration (`<LazyX hydrate-on-visible>`, `hydrate-on-idle`, `hydrate-on-interaction`, `hydrate-on-media-query`, `hydrate-never`) keeps the HTML but defers the component's JavaScript. Available in recent Nuxt 3 and Nuxt 4; confirm support in the installed version.

**Next.js**:
- `loading.tsx` wraps a segment in a Suspense boundary; `<Suspense>` inside a page streams sections independently.
- A route becomes dynamic when it reads request data (`cookies()`, `headers()`, `searchParams`, `connection()`); otherwise it can be prerendered. Design pages so the static shell does not read request data and only the dynamic hole does.
- Next 16 Cache Components (`cacheComponents: true`, `"use cache"`, `cacheLife`, `cacheTag`) give explicit control: cached parts prerender, uncached parts stream. The partial prerendering model behind it has been experimental for several versions; verify the status and flags for the installed minor before relying on it.

## Islands architecture

Islands means static HTML with independent interactive components, each shipping its own small bundle. It fits content sites (marketing, docs, blogs, news) where interactivity is the exception. Astro is the reference implementation; Nuxt's islands are experimental and Next.js server components achieve a similar outcome with a different model.

Do not migrate an application to an islands framework to "reduce JavaScript": dashboards and editors are mostly islands anyway. Apply the idea instead: server-render the static part, lazy-hydrate the few interactive widgets, and measure.

## Hydration: what it costs and how to measure it

Hydration runs the component tree on the client to attach listeners and state to server-rendered HTML. Its cost is proportional to the amount of client component code and the work done in setup (watchers, computed values, stores, third-party initializations). Symptoms: high Total Blocking Time, poor INP on first interactions, "the page is visible but buttons do nothing".

Measure:
1. Lighthouse / PageSpeed: Total Blocking Time and the "Reduce JavaScript execution time" audit on the route.
2. Chrome Performance panel with 4× CPU throttling: the long task after the main bundle executes is hydration; note its duration and what runs inside it.
3. `web-vitals` with attribution: `onINP` reports the interaction target and the long-task breakdown of the first interactions.
4. Framework analyzers (`nuxt analyze`, `@next/bundle-analyzer`): how much client JavaScript the route loads.

Reduce: less client code on the route (server components, lazy hydration, dynamic imports), fewer top-level watchers and stores created at setup, defer third-party scripts, avoid rendering huge lists during SSR (paginate or virtualize), keep payloads small (`pick`/`transform`). Measure again under the same conditions.

## Client-only applications (`ssr: false`)

A Nuxt app with `ssr: false` is a SPA with Nuxt's conventions: no HTML per request, no cross-request state on a server, everything runs in one browser tab. Consequences:
- Module-level singletons (`const cache = new Map()` in a composable, a module-level Axios instance with a mutable header) are **safe today** because there is one user per JavaScript module instance. They become cross-user leaks the moment SSR is enabled, a layer is reused by an SSR app, or code moves to a Nitro route. `state-audit.mjs` lists them.
- Reading `localStorage` or `window` in setup works; it will break on SSR.
- Auth tokens in `localStorage` are a security decision independent of rendering; see `security.md`.

Before turning SSR on (per route or globally): create HTTP clients per request (plugin), move the session to an `HttpOnly` cookie or a BFF, remove module-level mutable state, guard browser APIs, give `useAsyncData` keys, run the SSR concurrency test described in `testing.md`, and enable SSR on one public route first.

## Caching layers and how they compose

| Layer | Caches | Key | Invalidated by | Risk if misused |
|---|---|---|---|---|
| Browser HTTP cache | Hashed assets (immutable), HTML if allowed | URL + `Vary` | Hash change, `max-age`, `no-store` | Stale HTML served offline-first |
| CDN / edge | HTML and data with `public` cache headers, assets | URL + `Vary` + configured keys | TTL, purge API, `stale-while-revalidate` | Personalized HTML cached for everyone |
| Framework route cache | Nuxt `routeRules` (`prerender`, `swr`, `isr`, `cache`), Next.js Cache Components / fetch cache | Route or tag | TTL, `revalidateTag`/`updateTag`, redeploy | Same as CDN plus stale data after mutations |
| Server data cache (Nitro `cachedFunction`, Next `"use cache"`) | Expensive upstream calls | Function args or tag | TTL, tag | Per-user data cached under a shared key |
| Client query cache (Pinia Colada, TanStack Query) | API responses in the browser | Query key | `staleTime`, invalidation after mutations, logout | Two caches for one dataset without a strategy |

Composition rules:
- Authenticated HTML: `Cache-Control: private, no-store` (Nuxt `routeRules` headers or Nitro middleware; Next.js dynamic rendering does this by default for pages reading cookies). The CDN must not cache it, and `Vary: Cookie` is not a substitute.
- One source of truth for freshness per dataset: either the edge TTL or the application cache decides, not both with different numbers.
- Mutations invalidate the nearest cache: client query cache immediately, server tags on the write path, CDN purge only for public pages.
- Assets with content hashes: `public, max-age=31536000, immutable`; HTML: short or no cache.

## Nuxt specifics

```ts
// nuxt.config.ts (illustrative; keys verified against Nuxt 4 docs for route rules)
export default defineNuxtConfig({
  routeRules: {
    '/': { prerender: true },
    '/blog/**': { prerender: true },
    '/products/**': { swr: 600 },              // served stale up to 10 min while regenerating
    '/pricing': { isr: 3600 },                 // on supported hosts; falls back to swr semantics elsewhere
    '/app/**': { ssr: false, headers: { 'Cache-Control': 'private, no-store' } },
    '/api/public/**': { cors: true, headers: { 'Cache-Control': 'public, max-age=60' } },
  },
})
```

- `prerender`, `swr`, `isr`, `ssr`, `cache`, `headers`, `redirect`, `cors` are the rule kinds; which ones a host honors depends on the Nitro preset (static hosts cannot `swr`; check the deployment guide).
- Prerendered routes are discovered from links and `nitro.prerender.routes`; dynamic routes need explicit lists or a crawler.
- `useAsyncData` runs on the server for SSR routes and in the browser for `ssr: false` routes; code paths must be safe in both.
- The payload (`useState`, fetched data) is serialized into the HTML: a 2 MB list is a 2 MB page.

## Next.js specifics

- Server Components are the default; data fetched there never reaches the client as state. Client Components still render on the server during SSR (`dynamic(() => import(...), { ssr: false })` opts a component out).
- Static by default when a route reads no request data; `generateStaticParams` prerenders dynamic segments; `revalidateTag`/`updateTag`/`revalidatePath` refresh cached data after mutations.
- Streaming with `loading.tsx` and `<Suspense>` is the default way to avoid blocking a page on one slow fetch.
- Cache Components in Next 16 replace implicit fetch caching with explicit `"use cache"`; projects on Next 15 keep that version's model until the upgrade (see `nextjs.md`).
- Personalized data read from cookies forces dynamic rendering for the component that reads it; keep that read as low in the tree as possible so the shell stays static.

## Pitfalls

- Caching a page that reads a cookie: one user's name on another user's screen. Any personalization → `private`.
- `swr`/`isr` on list pages whose data changes per tenant resolved from the host: include the host in the cache key or do not cache.
- Enabling SSR on an app that stores the session in `localStorage`: the server never sees the session, so every SSR render is anonymous and the client re-renders everything (flash plus doubled requests).
- `Date.now()`, locale-dependent formatting and `Math.random()` in server-rendered templates: hydration mismatches (see `nuxt.md`).
- Streaming boundaries without reserved space: CLS.
- Treating prerendering as a security control: a prerendered page is public by definition.
- Mixing two freshness mechanisms (edge TTL of 10 minutes, query cache `staleTime` of 0): users see stale data for ten minutes and then refetch every second.
