---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Says both snippets are safe as written: an `onMounted` callback never runs on the server, and the `typeof window !== 'undefined'` guard makes the module-scope read client-only; neither throws on the server and neither is a hydration hazard by itself
- Says the `browser-api-in-setup` rule of `state-audit.mjs` deliberately does not report reads inside `onMounted` / `onBeforeMount` (or `useEffect` / `useLayoutEffect` and event handlers in React), nor reads under `import.meta.client`, `process.client` or `typeof window !== 'undefined'` guards, nor `.client.vue` / `.client.ts` files; a checklist that flags them is stricter than the evidence
- Explains what would still be a problem: if the value changes the markup on first paint, that is, `collapsed` initialised differently on server and client and used in the template before mount, or the sidebar rendered open on the server and immediately re-rendered collapsed; the mismatch comes from the initial state differing, not from where `matchMedia` is called; the fix is a server-consistent initial value (same default on both sides, or a cookie-backed `useState`) updated after mount, with a CSS media query for the initial layout if the re-layout is unacceptable
- For the analytics guard, notes that `false` on the server and possibly `true` on the client is fine as long as it does not render different HTML or decide a request on the server; if it does, the same initial-state rule applies
- Rejects wrapping the sidebar, or "everything that touches window", in `<ClientOnly>`: it removes server rendering of real content (flash, layout shift, nothing for crawlers) for no safety gain, and is for components that truly cannot render on the server

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Agrees that either snippet is a hydration hazard as written
- Recommends `<ClientOnly>` around the sidebar or around everything that touches `window`
- Says the audit reports these two cases as `browser-api-in-setup`
- Recommends `ssr: false` to make the checklist pass
