# Nuxt/Vue ↔ Next.js/React equivalences

Conceptual mapping for teams working in both stacks. These are **not exact equivalents**: rendering models differ (Nuxt hydrates the whole app; Next.js Server Components never hydrate), so translate intent, not code.

| Concern | Nuxt / Vue | Next.js / React | Key difference |
|---|---|---|---|
| Reusable stateful logic | Composable (`useX`) | Custom hook (`useX`) | Composables run once in setup; hooks run on every render and follow hook rules |
| Local state | `ref`, `reactive` | `useState`, `useReducer` | Vue mutates reactive values; React replaces state |
| Derived state | `computed` | Value computed during render (`useMemo` only if expensive) | |
| Side effects | `watch`, `watchEffect`, lifecycle hooks | `useEffect` | |
| SSR-safe shared state without a library | `useState(key)` | Server-fetched props, or context with per-request store | Nuxt `useState` is serialized to the client |
| Global client store | Pinia | Zustand, Redux Toolkit, Jotai | |
| Server-state cache | Pinia Colada (or TanStack Vue Query) | TanStack Query (or RTK Query) | Same concepts: keys, invalidation, optimistic updates |
| Page data fetching | `useFetch`, `useAsyncData` | `fetch` in Server Components | Next server data never needs client hydration of a cache |
| Mutations from forms | `$fetch` + Pinia Colada mutation, or Nitro route | Server Functions (`'use server'`) + `useActionState` | Server Functions are public endpoints: validate and authorize |
| App-wide instances | Plugins (`provide`) | Providers (context) | Nuxt plugins run per request on the server automatically |
| Route guards | Route middleware | `proxy.ts` + server-side checks | |
| Backend-for-frontend | Nitro `server/api` | Route Handlers, Server Functions | |
| Hybrid rendering config | `routeRules` | Per-route segment config, `"use cache"` | |
| Runtime config | `runtimeConfig` (`public` for browser) | `process.env` on server, `NEXT_PUBLIC_*` for browser | `NEXT_PUBLIC_*` is inlined at build time |
| Client-only rendering | `<ClientOnly>`, `.client.vue` | `'use client'` + `dynamic(..., { ssr: false })` | `'use client'` components still SSR by default |
| Component library | Nuxt UI (Reka UI + Tailwind) | shadcn/ui (Radix or Base UI + Tailwind) | Nuxt UI is a dependency; shadcn copies source into the repo |
| Headless primitives | Reka UI | Radix UI, React Aria | |
| Two-way binding | `v-model`, `defineModel` | Controlled props (`value` + `onChange`) | |
| Slots | Named and scoped slots | `children`, render props, element props | |
| Transitions | `<Transition>`, `<TransitionGroup>` | Motion, View Transitions | |
| 3D | TresJS | React Three Fiber | Both wrap Three.js declaratively |
| Testing components | Vue Test Utils / Testing Library Vue + Vitest | React Testing Library + Vitest | |
| Shared app slices | Nuxt Layers | Monorepo packages | No direct Next.js equivalent to layers |
