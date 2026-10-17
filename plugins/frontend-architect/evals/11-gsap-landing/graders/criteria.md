---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Uses GSAP context and matchMedia with prefers-reduced-motion
- Client-only setup with cleanup on unmount; ScrollTrigger refresh after layout changes
- Mentions GSAP license check and the official GSAP skills as companions

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Installs several animation and scroll engines (GSAP + Lenis + Locomotive + Motion) without need
- Ignores reduced motion or keyboard/anchor navigation
