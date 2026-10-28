---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Starts with an art direction statement derived from the product and audience (restraint, editorial typography, photography-led composition) before naming any library
- Makes concrete typographic, spacing and color decisions (scale, pairing roles, palette with contrast) and one strong layout decision instead of generic defaults
- Treats motion as optional and purposeful, with prefers-reduced-motion and performance (LCP image, fonts) addressed
- Names the generic patterns it avoids (centered hero + three cards + gradients + emoji icons)

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Proposes Three.js/WebGL or a scroll-jacking engine by default without a stated need
- Stacks several animation engines
- Ignores accessibility or performance of the hero
