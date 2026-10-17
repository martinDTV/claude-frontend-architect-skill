---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Says no and explains which criteria are missing (independent teams, release coupling)
- Recommends enforcing feature boundaries inside the app first

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends microfrontends
- Recommends Module Federation as a solution for app size
