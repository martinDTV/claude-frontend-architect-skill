---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A Next.js 16 Client Component imports a helper that reads a secret from process.env; how to find and fix server code reaching the browser"
expected_outcome: "server-only marker, server/client export split, Server Component passes data down, rotate the secret, and a dependency graph across the use client boundary to detect it"
tags: ["activation:architect", "domain:react-next", "domain:security", "domain:architecture"]
---

Next.js 16 App Router project. `src/features/payments/components/CheckoutButton.tsx` starts with `'use client'` and imports `createCheckoutSession` from `../lib/stripe.ts`, which does `const stripe = new Stripe(process.env.STRIPE_SECRET!)`. The build passes and the button works. A new teammate asks whether this is fine, since the file "is just a helper". What is actually happening, how do we fix it, and how do we find other cases like it across the codebase? There is no repository available in this session: answer from this description.
