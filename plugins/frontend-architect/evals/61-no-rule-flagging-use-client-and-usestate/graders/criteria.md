---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Declines to add the two rules as specified and says why: `'use client'` is the boundary that makes server/client separation explicit (removing it moves code to the server or breaks interactivity, it does not add security) and `useState` is local UI state with no security property; both rules would be wrong on every file and would train teams to ignore the audit
- Explains the level vocabulary correctly: a `confirmed` finding means the defect is present as stated; a rule that fires on a legitimate pattern cannot be confirmed, and turning CI red on it blocks nothing dangerous
- Proposes the evidence-based rules that address the real concerns: server-only modules reachable from client boundaries, client-only modules reachable from server segments, private `process.env` reads in client bundles (excluding `NEXT_PUBLIC_*` and `'use server'` modules), tokens in web storage, Server Actions and route handlers without authorization checks, permission checks that live only in the UI
- Offers something concrete for the penetration-test follow-up: map each pentest finding to one of those rules or to a manual check, with the evidence tier the tool can honestly give (confirmed, heuristic, info)

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Adds the rules as requested, even with lower severity
- Suggests removing `'use client'` or `useState` across the codebase
- Marks heuristic signals as `confirmed` to satisfy the CI requirement
- Refuses without proposing the rules that do catch the real problems
