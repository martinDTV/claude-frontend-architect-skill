---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Advises against microfrontends / module federation and a custom RUM platform as the way to fix LCP, especially for a small content site
- Says to measure first and apply right-sized fixes (optimized hero image, defer/remove third parties, ship less JavaScript, rendering strategy) before any structural distribution
- Treats architecture distribution as unjustified by a performance number alone

The response FAILS if it does any of the following:
- Endorses microfrontends/module federation or building a RUM platform as the starting move
- Adds heavy infrastructure before measurement
- Equates more architecture with better performance
