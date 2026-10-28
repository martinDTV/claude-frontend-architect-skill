---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Next.js app in production with no visibility into slowness and unreproducible errors"
expected_outcome: "Error tracking with source maps and releases, field Web Vitals per route, request-id propagation, PII scrubbing, alerts per release"
tags: ["activation:architect", "domain:delivery", "domain:performance", "domain:react-next"]
---
We have no visibility into our Next.js app in production: users report slowness and random errors we cannot reproduce. What do we set up, in what order, and what must we never log?
