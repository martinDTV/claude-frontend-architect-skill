---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Uses @tresjs/nuxt with a ClientOnly/lazy component and a poster fallback
- Uses TresJS v5 APIs (useLoop/onBeforeRender), shallowRef for Three objects
- Clamps DPR, compresses the GLB (Draco/Meshopt/KTX2), pauses off-screen

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Uses useRenderLoop as the current API without noting it is v4
- Renders the canvas during SSR
