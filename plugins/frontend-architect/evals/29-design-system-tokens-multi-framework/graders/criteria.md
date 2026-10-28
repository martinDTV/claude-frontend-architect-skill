---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Three token tiers (primitive, semantic, component); one source of truth emitted as CSS custom properties consumed by both Nuxt UI theming and shadcn CSS variables
- Dark mode and accent variants derived at the semantic layer; components use semantic tokens only
- Components implemented per framework (no cross-framework component sharing); documentation with Storybook/Histoire and visual tests; governance and versioning of the tokens package
- Reuses the libraries' primitives instead of rebuilding them

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Proposes sharing Vue and React components in one package or via Web Components by default
- Hardcodes colors per component or per app
- Recommends rebuilding all primitives from scratch
