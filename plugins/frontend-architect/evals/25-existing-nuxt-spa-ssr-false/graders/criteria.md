---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Respects the working ssr: false setup: no SSR migration without a stated need (SEO/first-load), and lists what would have to change before enabling SSR (module-level state, per-request clients)
- Classifies the module-level Axios + mutable Authorization as a risk that blocks SSR (not a current cross-request leak in a client-only app) and the tokens in localStorage as the real security issue, with a path to cookie/BFF sessions
- Proposes an incremental plan with tests on the session core first; no rewrite
- Mentions the useState keys should be wrapped in typed composables rather than raw keys spread across modules

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends enabling SSR or rewriting auth as the first step
- Calls the module-level client an active cross-request leak in a client-only app
- Proposes a framework change
