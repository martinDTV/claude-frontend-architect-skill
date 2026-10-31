---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Produces a design contract before any screen: audience and environment (long shifts, dim warm office, phones in the yard), requirements with ids, a direction statement of a few lines, decisions per area that cite requirements, a type scale with a ratio, a spacing base, colour roles for light and dark (canvas, surface, fg, fg-muted, border, border-strong, accent, focus, status roles), and names `design-contract.mjs` (or the design-contract reference) as the validator of traceability, grids and WCAG pairs in both themes.
- Chooses a stage-1 feature-based architecture (features/<domain> with components, composables, api, schemas) with Nuxt UI, justifies it in a few lines, and explicitly leaves out a global store for server data, a monorepo and microfrontends.
- Describes the enterprise behaviours concretely: a shell with a skip link and a search palette; data regions with loading, empty, error and ready states and a way to reach each (a query parameter or mock mode); the shipments table with its state in the URL (sort with aria-sort on the header cell, filters, debounced search, pagination, page size), a truthful count line; row actions named per row with a details panel, an assign dialog with validation, a reversible action with undo, an irreversible one behind a confirmation that names the record and the consequence; a form with one schema, an error summary that takes focus, server errors on their fields, success that leaves the form; preferences (density, theme, columns, page size) versioned in storage; stacked cards under 768px; a dense default row height with a comfortable option.
- Covers accessibility and legibility as part of done: keyboard reach of the toolbar, focus trapped and restored in overlays, status by word and shape not colour alone, contrast in both themes, 320px reflow and 200% text (naming at least one concrete pitfall such as rem widths doubling or implicit grid columns).
- Gives a verification plan that separates what a tool proves (browser checks on the production build, axe, contrast, overflow, hydration), what it only flags (heuristics to read), and what a person must judge (hierarchy, copy, whether the density suits dispatchers), and says what evidence each leaves (JSON reports, screenshots, before and after numbers).
- States proportionality: no 3D, no scroll storytelling, no generated palette or style library, no microfrontends; motion limited to feedback and reduced-motion respected.
- Names the references it relied on (enterprise-ui-patterns, design-contract, data-tables, forms, persistence, accessibility, ui-verification or equivalents).

The response FAILS if it does any of the following:
- Starts from colours or components without requirements and a contract, or chooses a palette by taste alone.
- Proposes Pinia or a global store as the home of the shipments data, a monorepo, microfrontends, or a second data-fetching layer without a reason.
- Omits the empty or error states, the URL as table state, the confirmation for the destructive action, or the phone layout.
- Claims accessibility or visual quality without saying how it is measured, or presents heuristics and opinions as confirmed defects.
- Recommends or claims to have run an external design skill without naming the Skill tool invocation and its result.
