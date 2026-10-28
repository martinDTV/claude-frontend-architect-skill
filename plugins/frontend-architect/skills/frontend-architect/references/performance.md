# Performance

## Contents
- Measure first
- Field versus lab
- Core Web Vitals
- JavaScript and bundles
- Rendering and data
- Images and fonts
- Caching
- GPU and memory
- Workflow
- Reproducible procedure
- Hydration cost
- INP debugging
- Network waterfalls
- Memory leaks procedure
- Budgets

## Measure first

Never optimize without a baseline. Record before and after with the same conditions:
- **Field data** (real users): CrUX, the framework's analytics or a RUM tool reporting Web Vitals by route.
- **Lab data**: Lighthouse (CI with budgets), WebPageTest, Chrome DevTools Performance panel with CPU throttling.
- **Bundles**: `nuxi analyze` (Nuxt), `@next/bundle-analyzer` or the build output (Next.js).

## Field versus lab

| | Field (RUM: CrUX, `web-vitals`, vendor RUM) | Lab (Lighthouse, WebPageTest, DevTools) |
|---|---|---|
| Answers | What users experience, by route, device and network | Why, on one configuration, reproducibly |
| Use for | Prioritizing, SLOs, detecting regressions after release | Diagnosing, comparing before/after, CI gates |
| Blind spots | Cannot explain a number without attribution; needs traffic | Misses real devices, caches, extensions, logged-in paths unless scripted |
| Rule | Decide **what** to fix from the field | Prove **that** it is fixed in the lab, then confirm in the field |

Setup of field collection: `observability.md`.

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

## Reproducible procedure

A performance claim without a reproducible measurement is an opinion. For every optimization:

1. **Baseline**: production build, the same route and data, a fixed device profile (for example "Moto G Power class, CPU 4x slowdown, Slow 4G"), cold and warm cache, at least five runs; record the median and p75 of LCP, INP (or TBT in the lab), CLS, TTFB, total JS transferred and executed. Save the Lighthouse JSON or WebPageTest link.
2. **One change** at a time, in its own commit.
3. **Measure again under identical conditions**; report the delta with the same statistics. Improvements under 5% on five runs are noise.
4. **Guard**: add or tighten the budget that would have caught the regression (`assets/lighthouse-budgets.json`, `bundle-budget.mjs` thresholds) in the same PR.
5. **Confirm in the field** after release: the route's p75 over the next days, split by release id.

Write the numbers in the PR with the device/network profile and the commands; `bundle-budget.mjs --md` output and the Lighthouse CI summary are enough.

## Hydration cost

Hydration is JavaScript executed before the page becomes interactive. Measure it, then decide what not to hydrate.

- **Measure**: DevTools Performance panel on a throttled CPU, from navigation to the end of the main-thread work after `DOMContentLoaded`; the Coverage panel for unused JS on load; `nuxi analyze` (Nuxt) or `@next/bundle-analyzer` (Next.js) for what the entry pulls in; `bundle-budget.mjs` for the startup set from the build manifest or the rendered HTML.
- **Reduce**: server-render static parts without client code (Next.js Server Components; Nuxt server components or plain markup), lazy hydration for below-the-fold interactive parts (Nuxt `hydrate-on-visible`/`hydrate-on-idle`/`hydrate-on-interaction` on `Lazy*` components; in Next.js small Client Components loaded with `next/dynamic`), move heavy libraries behind interaction (editors, charts, maps), and keep SSR payloads small (`pick`/`transform`, no full lists the page does not render).
- **Watch for**: a global store hydrated with everything on every page, `useAsyncData` payloads duplicated by a query cache, `'use client'` at layout level, third-party scripts in `<head>`.
- **Decision**: hydrate immediately only what the user can interact with in the first viewport; defer the rest; do not ship at all what never becomes interactive.

## INP debugging

INP measures the slowest interaction (p98 of interactions on the page). Break the slow interaction into its three parts in the Performance panel:

| Part | Cause | Fix |
|---|---|---|
| **Input delay** | Main thread busy when the user acted: hydration, long tasks from scripts, timers | Break up long tasks; defer non-critical work; lazy hydrate; move third parties off the critical path |
| **Processing** | Expensive handlers: heavy computed/watch chains, large list re-render, synchronous layout reads | Compute less (virtualize, memoize derived data, `shallowRef` for big immutable data, selectors in Zustand), avoid layout thrashing, yield between steps (`scheduler.yield()` where supported, otherwise `await` a macrotask) |
| **Presentation delay** | Large style/layout/paint after the handler: big DOM, expensive CSS, images without dimensions | Smaller DOM, `content-visibility: auto` on long lists, animate only `transform`/`opacity`, reserve space |

Procedure: reproduce the interaction from the field attribution (the `web-vitals` attribution build names the target element), record it with CPU throttling, find the long task, attribute it to a handler or a render, fix one cause, measure again. Heavy watchers and effects that run on every keystroke (`component-complexity.mjs` lists files with many watchers) are the most common processing cause in Vue and React apps.

## Network waterfalls

- **Find**: the Network panel's waterfall for the route; `Promise.all` missing when two requests start only after the previous resolved; a component that fetches only after its parent's data arrived; fonts and critical CSS discovered late.
- **Fix**: fetch independent data in parallel at the route level (`Promise.all` in Server Components or a page-level `useAsyncData` for several calls; a BFF endpoint that composes several backend calls server-side when the client would otherwise chain them); prefetch on hover or when the link is visible; preload the LCP image and the critical font; stream slow parts (`<Suspense>`, `loading.tsx`, Nuxt `lazy: true` with skeletons) instead of blocking the shell.
- **Verify**: the request start times overlap in the waterfall; E2E can assert it (`testing-scenarios.md`, "No waterfall on the key route").

## Memory leaks procedure

1. Open the route, take a heap snapshot; navigate away and back ten times; take another snapshot; compare: growing counts of detached DOM nodes, listeners, closures retaining components.
2. Check candidates from `leak-patterns.mjs` (listeners, intervals, observers, streams, GSAP, Three.js, subscriptions without cleanup) and module-level caches from `state-audit.mjs`.
3. In the Performance panel, record with memory and watch the JS heap and node count across navigations: a sawtooth is healthy; a staircase is a leak.
4. Fix with the framework's cleanup hook (`onBeforeUnmount`/`onScopeDispose`, effect cleanup return) or the helper that owns the lifecycle (VueUse, `useGSAP`, dispose helpers in the `creative-frontend` skill).
5. Add the mount/unmount loop test (`testing-scenarios.md`) for the component that leaked.

For SSR servers, a rising resident memory between deploys with flat traffic has the same causes at module level; `deployment.md` covers sizing and restarts, which are mitigations, not fixes.

## Budgets

- Per **route pattern**, not one number for the app: content routes, product routes and authenticated dashboards have different budgets. `assets/lighthouse-budgets.json` is a starting point (resource sizes, counts and timings) for Lighthouse CI; `bundle-budget.mjs` guards the startup set and the largest chunk in gzip KB from the real build output.
- Set budgets from the current baseline minus the headroom you want, tighten as you improve, and fail the PR on breaches; a budget nobody can meet is deleted or renegotiated, not ignored.
- Review budgets when the framework major changes or the target devices change, and record the reasoning in the repository next to the file.
