---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill, Bash]
description: "Independent evaluation brief C (1.5 increment 5): a specialty store's frontend"
expected_outcome: "The domain as pure functions first, filters as navigation in the URL, a strict card grid with availability as words, unambiguous variants in the URL, a local bag with versioned storage and a dialog drawer, no payments, dark theme that leaves photographs alone, the verification plan with its classes"
tags: ["activation:architect", "domain:visual", "domain:nuxt-vue", "domain:state", "suite:ui-briefs"]
---

Brief C. A specialist shop sells studio ceramics by named makers: a few hundred pieces, each in small runs with glaze and size variants and real stock (some pieces have two left, some are sold out, some are made to order). Shoppers browse on phones in the evening and compare glazes; restaurants order sets from a desktop. The shop wants a warm, exact interface where the photographs carry the page, filtering by maker, form, glaze and availability is the main navigation, adding to the bag confirms without leaving the page, and a dark theme exists for evening browsing. Payments are handled elsewhere and are out of scope. The team uses Nuxt with Nuxt UI. There is no repository: answer from this brief.

Deliver, in order: (1) the design contract (audience, requirements with ids, direction, decisions per area, scales, roles for both themes, imagery policy) and how it is validated; (2) the domain model and the pure functions you would write and test before any component; (3) the catalogue, the product page and the bag: behaviours, states, what lives in the URL, what lives in storage and how it is versioned; (4) stock and availability: how each state reads on a card and on the detail, and what the action does in each; (5) phone and desktop layouts, 320px and 200% text, the dark theme and the photographs; (6) the verification plan with what is proved, flagged and judged, and the evidence; (7) proportionality: what this shop does not need.
