---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "SEO product pages in Next.js 16 with a wishlist button and filters"
expected_outcome: "Server Components fetch; only wishlist and filters are client leaves; Next 16 caching and URL filter state"
tags: ["activation:architect", "domain:react-next", "domain:architecture"]
---
Next.js 16 app: product listing and product detail pages must be SEO-friendly; there's an 'add to wishlist' button and a filter sidebar. How should I split server and client components and fetch data?
