---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Yes: several deployables that genuinely share code; recommends pnpm workspaces with Turborepo or Nx with a reason
- Shares tokens, generated API contracts/schemas and config packages; per-framework UI packages; does not share business logic through a 'common' package
- Keeps each app stage 1 internally; notes affected-only CI and versioning of contracts
- Considers Nuxt Layers for the shared Nuxt shell/design system between the two Nuxt apps

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends microfrontends
- Proposes one shared package with domain logic for all apps
- Recommends a monorepo for a single app
