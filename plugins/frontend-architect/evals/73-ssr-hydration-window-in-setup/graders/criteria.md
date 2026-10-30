---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Names `browser-api-in-setup` (from `state-audit.mjs`) as a confirmed, high-severity finding for both the module-scope `window.innerWidth` in the composable and the `localStorage` read at the top level of `<script setup>` with SSR on, because that code runs on the server; explains that the try/catch is not a client guard: it only turns the crash into a server value that differs from the client value, which is exactly the hydration mismatch
- Names `nondeterministic-render` (heuristic) for `Math.random()` feeding the render (the same rule covers `Date.now()`, `crypto.randomUUID()` and `new Date()`): server and client produce different values, so keys and markup differ; the fix is a stable key from the data or an id generated once and shared (`useId()`, or a server value carried to the client through `useState`)
- Gives the right fixes: move the browser reads into `onMounted` (or `onBeforeMount`) and render a server-safe initial state; or guard them with `import.meta.client`; or isolate the component in a `.client.vue` file; for the theme, prefer an initial value the server can also know (a cookie through `useCookie`, or `useState` seeded on the server) so the first paint already matches, instead of reading `localStorage` first
- Explains the rule's boundaries so the team does not over-fix: reads inside `onMounted` / `useEffect` / event handlers, or under `import.meta.client`, `process.client` or `typeof window !== 'undefined'` guards, or in `.client.vue` / `.client.ts` files are not reported; the severity drops to low when `ssr: false` because then it only blocks enabling SSR later; the lexical engine stays silent on these rules
- Names the runtime confirmation: compare the server HTML with the hydrated DOM; the browser mode's `--checks hydration` reports `hydration-mismatch` and `client-only-rendered-content` against a local build, and the Vue hydration warnings must be gone from the console

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Proposes `ssr: false` (globally or for the route) as the first or main fix
- Says a `'use client'`-style directive or marker exists in Nuxt or Vue, or that such a marker would prevent server rendering
- Keeps or recommends the try/catch around `window` as a solution
- Recommends wrapping the whole dashboard in `<ClientOnly>` as the default answer
