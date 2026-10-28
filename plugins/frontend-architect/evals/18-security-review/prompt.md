---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Next.js page with dangerouslySetInnerHTML, a NEXT_PUBLIC secret and an unchecked Server Action"
expected_outcome: "Sanitize CMS HTML, move and rotate the secret, validate and authorize the Server Action"
tags: ["activation:architect", "domain:react-next", "domain:security"]
---
Review: a Next.js page renders CMS HTML with dangerouslySetInnerHTML, an env var NEXT_PUBLIC_STRIPE_SECRET_KEY is used in a client component, and a Server Action deletes a project by id from formData without checks.
