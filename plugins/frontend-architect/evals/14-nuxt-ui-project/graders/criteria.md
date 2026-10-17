---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Recommends using Nuxt UI components and theming via app.config and tokens
- Wrap only to add domain meaning
- Mentions UApp requirement for overlays/toasts or checking docs/MCP for exact APIs

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Agrees to rebuild modal/table/toast from scratch
