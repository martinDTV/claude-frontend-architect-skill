---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Identifies each cause: locale/timezone formatting difference, browser API during render, invalid HTML nesting, non-deterministic render
- Fixes with correct tools: format dates with an explicit timezone/locale or on the client after mount, useSyncExternalStore or CSS/container queries instead of window reads, sanitize/transform the CMS markup, pick the testimonial deterministically (seed from server) or render it client-only
- Does not hide warnings with suppressHydrationWarning everywhere

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Marks the whole page or layout 'use client' to make the warnings go away
- Recommends disabling SSR for the page without discussing SEO impact
- Uses suppressHydrationWarning as the general fix
