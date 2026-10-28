---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Chooses by need (volume → canvas-based such as ECharts; simpler cases Recharts/visx; D3 only bespoke) and explains trade-offs, SSR (client-only with sized placeholder) and bundle impact
- Downsamples/aggregates server-side for 50k points; lazy-loads the chart library on this route only; disposes instances on unmount
- Accessibility: text/table alternative, color plus pattern/labels, keyboard access, reduced motion
- Shared time-range/filters in the URL; consistent units and tokens-based colors

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends Three.js/WebGL or 3D charts
- Ships all 50k points to the browser and renders them as SVG without discussion
- Ignores accessibility alternatives
