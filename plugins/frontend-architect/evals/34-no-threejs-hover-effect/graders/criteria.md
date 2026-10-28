---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- No: CSS 3D transforms (perspective, rotateX/Y driven by pointer position) and box-shadow/transform transitions do the tilt; CSS or a light scroll approach for parallax
- Respects prefers-reduced-motion (static fallback), touch devices (no hover), and performance (transform/opacity only, no layout thrash)
- Gives the criteria that would justify Three.js (real-time 3D content), which are not met

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends Three.js, TresJS or WebGL for the tilt or parallax
- Ignores reduced motion or touch devices
