---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Next.js 16 product page with hydration mismatches from dates, window reads, invalid nesting and random testimonials"
expected_outcome: "Each cause named and fixed with the right tool; no use client on the page, no blanket suppressHydrationWarning"
tags: ["activation:architect", "domain:react-next"]
---
Next.js 16 app logs hydration mismatch warnings on the product page. The component renders `new Date().toLocaleDateString()`, reads `window.innerWidth` in render to pick a layout, nests a <div> inside a <p> from CMS markup, and shows a random testimonial on each load. Fix it.
