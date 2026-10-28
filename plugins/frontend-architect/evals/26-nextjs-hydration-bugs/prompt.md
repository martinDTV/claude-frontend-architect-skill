---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Next.js 16 app logs hydration mismatch warnings on the product page. The component renders `new Date().toLocaleDateString()`, reads `window.innerWidth` in render to pick a layout, nests a <div> inside a <p> from CMS markup, and shows a random testimonial on each load. Fix it.
