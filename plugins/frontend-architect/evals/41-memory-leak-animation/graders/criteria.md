---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Identifies missing cleanup: GSAP tweens/ScrollTriggers without context revert, listener without removal, interval without clear, Three.js geometries/materials/textures/renderer never disposed and the loop never stopped
- Fixes: gsap.context reverted on unmount (or matchMedia), useEventListener/removeEventListener, clearInterval or useIntervalFn, dispose traversal + setAnimationLoop(null) + renderer.dispose
- Respects reduced motion and client-only rendering
- Proposes tests: mount/unmount loops asserting dispose/clear calls (spies), heap snapshot procedure; mentions the plugin's leak-patterns script or an equivalent lexical check

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Blames Vue or the browser without naming the resources
- Suggests reloading the page periodically as the fix
