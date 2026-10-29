---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Expresses the policy as configuration next to the domain classification (the plugin's `.frontend-audit.json` `dependencies` block with `allowed` pairs and `exceptions` carrying `from`, `to`, `reason`, `since`, `until`, or an equivalent), so the tool and the humans read the same matrix
- Allowed cycle: when both directions are allowed, the cycle is reported as information (`allowed-cycle`: a cycle by design, not a violation), with the note that it still blocks splitting the two domains into layers, packages or microfrontends until one direction becomes type-only or goes through a third module
- Forbidden pair: `operaciones → comercial` is reported as a forbidden dependency, split into runtime file pairs (confirmed, high when verified edges exist) and type-only pairs (low severity, compile-time coupling only); type-only coupling is still a contract to publish, not something to hide
- Exception: `administracion → comercial` is reported as an architecture exception with its reason and dates, kept visible with its current counts so it cannot grow silently and disappears when the refactor lands; it is not a violation while the exception stands
- Keeps shell → domain and shared → domain rules separate from the business matrix

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Reports the allowed cycle as a violation or tells the team to break it immediately
- Hides type-only forbidden dependencies because they do not exist at runtime
- Hard-codes the matrix in the tool instead of configuration, or recommends suppressing findings file by file
- Treats the exception as permanent or drops it from the report
