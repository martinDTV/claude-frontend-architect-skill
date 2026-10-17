# Performance

## Contents
- Measure first
- Core Web Vitals
- JavaScript and bundles
- Rendering and data
- Images and fonts
- Caching
- GPU and memory
- Workflow

## Measure first

Never optimize without a baseline. Record before and after with the same conditions:
- **Field data** (real users): CrUX, the framework's analytics or a RUM tool reporting Web Vitals by route.
- **Lab data**: Lighthouse (CI with budgets), WebPageTest, Chrome DevTools Performance panel with CPU throttling.
- **Bundles**: `nuxi analyze` (Nuxt), `@next/bundle-analyzer` or the build output (Next.js).

## Core Web Vitals (good thresholds at the 75th percentile)

| Metric | Good | Usual causes | Usual fixes |
|---|---|---|---|
| LCP | ≤ 2.5 s | Slow server, render-blocking resources, unoptimized hero image, client-side rendering of above-the-fold content | SSR/SSG, preload/`priority` the LCP image, responsive images, caching |
| INP | ≤ 200 ms | Long JavaScript tasks, heavy hydration, expensive handlers | Less JS, code splitting, lazy hydration, defer work (`scheduler.yield`, `requestIdleCallback`), move work off the main thread |
| CLS | ≤ 0.1 | Images without dimensions, late-loading fonts, injected banners | Width/height or aspect-ratio, `next/font` or `@nuxt/fonts`, reserved space for dynamic content |

## JavaScript and bundles

- Server-render what does not need interactivity (Next.js Server Components; Nuxt server components or static content).
- Route-level code splitting is automatic; split heavy components further with `defineAsyncComponent`/`Lazy` (Nuxt) or `next/dynamic`.
- Lazy hydration for below-the-fold interactive parts (Nuxt hydration strategies; in Next.js keep them as small Client Components loaded dynamically).
- Audit dependencies: replace heavy libraries (moment → date-fns or `Intl`; lodash full import → targeted imports or native).
- Third-party scripts loaded after interaction or idle (`useScript` in Nuxt, `next/script` with `strategy="lazyOnload"`).
- Set budgets per route in CI and fail when exceeded.

## Rendering and data

- Avoid waterfalls: parallel requests (`Promise.all`), fetch at the route level, prefetch on hover or visibility.
- Stream slow parts (`<Suspense>`, `loading.tsx`) instead of blocking the whole page.
- Paginate or virtualize long lists (VueUse `useVirtualList`, TanStack Virtual).
- Keep SSR payloads small: only the fields the page renders (`pick`, select specific columns).
- Avoid unnecessary re-renders: stable keys, selector-based subscriptions (Zustand), `shallowRef` for large immutable data in Vue.

## Images and fonts

- `@nuxt/image` or `next/image`: modern formats (AVIF/WebP), responsive `sizes`, lazy loading by default, priority only for the LCP image.
- Fonts self-hosted and subset; `font-display: swap` or optional; at most two families and a few weights; preload only the critical one.

## Caching

- Static assets with content hashes: `Cache-Control: public, max-age=31536000, immutable`.
- HTML and data: framework caching (Nuxt `routeRules` with `swr`/`isr`, Next.js Cache Components) plus CDN.
- Client: query cache `staleTime` tuned per domain.

## GPU and memory

- Animate only `transform` and `opacity`; avoid animating layout properties.
- Remove listeners, observers, intervals, animation timelines and WebGL resources on unmount (see `creative-frontend` skill for 3D).
- Watch for detached DOM and growing heaps in long sessions (DevTools Memory panel).

## Workflow

1. Identify the slow route and metric from field data.
2. Reproduce in the lab and find the cause (Performance panel, bundle analysis).
3. Apply one change; measure again under the same conditions.
4. Add a budget or test so it does not regress.
