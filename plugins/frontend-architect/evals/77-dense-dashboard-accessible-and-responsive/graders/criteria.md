---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Structural decisions: the module lives behind a public entry with its components, composables, stores and types inside; incidents are server state in a query cache or `useFetch`/`useAsyncData` with keys per filter, not copied into the Pinia store; filters and selection live in the URL; a dependency check (`domain-deps` / `contracts-check` or an equivalent CI rule) keeps the boundary honest because auto-imports bypass import rules
- Visual decisions for all-shift supervision: a quiet, dense direction; hierarchy led by the numbers that drive action; compact density with consistent row heights and tabular numerals; status color from tokens with a non-color cue; explicit loading, empty and error states; motion limited to state feedback and respecting reduced-motion
- Accessibility requirements for keyboard-only and screen-reader supervisors: native controls or Nuxt UI primitives with real accessible names, visible focus, landmarks and a heading structure, a calm live region (`role="status"`) for incident updates, a data table with real headers and announced sorting, dialogs with a name, focus moved in, Escape and focus restored, and no hover-only disclosure
- Responsive matrix and the layout decisions that follow: desktop at 100% and 125% text / zoom (the 13-inch laptop), tablet with touch targets, no control covered by fixed bars and no page-level horizontal overflow except intentional scrollers; sidebar collapse, sticky primary actions and table density decided accordingly
- Verification plan in tiers: static `ui-audit.mjs --rules a11y,forms` plus `state-audit` and `routes-audit` on the repository now; `browser-audit.mjs` (axe, keyboard, dialogs, responsive with `--viewports mobile,tablet,desktop --text-scale 1,1.25`, hydration) once a local build exists and the user opts in; human review with assistive technology for what no tool judges (reading order, meaningful names, timing, cognitive load), stated explicitly as not WCAG conformance

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Keeps incidents in the Pinia store as the source of truth or proposes an event bus between domains
- Proposes Three.js, gradients, parallax or decorative animation for an operations dashboard
- Claims the result will be WCAG conformant or compliant because the audits pass
- Answers only the structure or only the visual and accessibility side
- Proposes microfrontends or a rewrite of the whole back-office
