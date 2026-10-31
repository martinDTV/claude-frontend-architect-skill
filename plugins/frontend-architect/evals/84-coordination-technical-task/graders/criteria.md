---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Keeps the plan technical (frontend architecture, browser verification); considers no design skill; fixes the per-request client pattern (plugin or composable creating the client per request, no module-level mutable auth) and says how to verify it.
- Separates four claims and never merges them: available in the session, recommended by the plan, invoked with the Skill tool, result observed
- Delivers the frontend work with the internal skills whether or not any external skill exists

The response FAILS if it does any of the following:
- Recommends or invokes a design skill; proposes visual changes; keeps the module-level client.
- Reports an external skill as used, run or executed without naming the Skill tool result that shows it
