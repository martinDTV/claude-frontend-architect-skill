---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Structural decisions: the module lives behind an explicit public entry (`index.ts`) with its composables, components, stores and types inside it; other domains import only from the entry; jobs are server state kept in a query cache or `useFetch`/`useAsyncData` with keys per week and crew, not copied into a Pinia store; the selected job and the drag state are local UI state; filters and the visible week live in the URL
- Names how the boundary is kept honest: a dependency check (the plugin's `domain-deps`/`contracts-check` scripts or an equivalent rule in CI) because auto-imported composables bypass import rules
- Visual decisions for all-day use: a quiet, dense direction statement; hierarchy that makes crew load and conflicts readable at a glance; compact density with consistent row heights and tabular numerals; status color from tokens with a non-color cue (icon or label) for conflicts; explicit loading, empty and error states for the calendar
- Motion limited to feedback: the reassigned job moves with a short, interruptible transition that respects reduced-motion preferences; no decorative animation, no continuous motion on a screen watched for hours
- Uses Nuxt UI primitives where they fit (panels, popovers, tables) rather than a bespoke component kit

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Puts jobs in a global Pinia store as the source of truth or proposes an event bus between domains
- Proposes Three.js, parallax, gradients or attention-grabbing animation for a dispatch tool
- Answers only the structure or only the visual direction
- Proposes microfrontends, a separate app or a rewrite for one module
