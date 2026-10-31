# Design systems, UI and UX

## Contents
- When to build a design system
- Tokens
- Every data view has five states
- Layout, typography, color, spacing
- Forms and UX writing
- Avoiding generic AI-looking interfaces
- Companion design skills

## When to build a design system

| Situation | Approach |
|---|---|
| One app | Theme the component library with tokens; document a few patterns in the repo |
| Several apps, one framework | `packages/ui` (components) + `packages/tokens` in a monorepo; Storybook (or Histoire for Vue) for documentation and visual tests |
| Several apps, several frameworks | Framework-agnostic `packages/tokens`; components per framework themed from the same tokens |

## Tokens

- Three tiers: **primitive** (`blue-600`, `space-4`), **semantic** (`color-bg-surface`, `color-text-muted`, `color-border-danger`), **component** (only where needed: `button-radius`).
- Components use semantic tokens, never primitives, so themes and dark mode change one layer.
- Emit CSS custom properties from one source (JSON + a build step such as Style Dictionary, or a Tailwind theme file) so Nuxt UI and shadcn/ui can share them.
- Scales: a typographic scale (for example 1.2 or 1.25 ratio), a spacing scale on a 4 px base, radius and shadow scales. No arbitrary values outside the scale in product code.
- The source of the tokens is the **design contract** (`design-contract.md`): requirements, a direction statement and decisions that cite requirements, then the scales and the eighteen colour roles per theme; `scripts/design-contract.mjs` validates it (traceability, grids, WCAG pairs in light and dark) and emits the CSS, the Tailwind v4 theme, the Nuxt UI mapping or a DTCG file. Product code uses roles (`bg-canvas`, `text-fg-muted`, `border-border-strong`), never ramp steps. Three activities, kept apart: **token design** (the contract and its emitted tokens), **component implementation** (the library's parts and the product's components reading the tokens) and the **consistency audit** (`scripts/design-consistency.mjs`: where the code still carries literals; a library's copied components and code that predates the contract are judged as such, not as the product's drift).

## Every data view has five states

1. **Loading**: skeleton matching final layout (avoids layout shift), or a spinner only for short, small areas.
2. **Empty**: explain why it is empty and the next action.
3. **Error**: what happened in human terms, what the user can do, retry when it makes sense. Never raw error codes.
4. **Partial**: some data failed or is stale; show what you have.
5. **Success**: the data, with feedback for user actions (toasts for background confirmations, inline for form results).

## Layout, typography, color, spacing

- Clear hierarchy: one primary action per view; size, weight and color for importance, not decoration.
- Line length 50 to 75 characters for reading text; body text 16 px minimum.
- Color contrast at least 4.5:1 for text and 3:1 for UI components and large text (`accessibility.md`). Never convey meaning by color alone.
- Consistent spacing rhythm from the scale; align to a grid.
- Responsive by content, mobile first; test at 320 px width and with 200% zoom.
- Touch targets at least 24×24 CSS px (44×44 recommended for primary mobile actions).

## Forms and UX writing

- Labels always visible (placeholders are not labels); helper text before errors happen.
- Validate on blur or submit, not on every keystroke; show errors next to fields and summarize on submit.
- Buttons say what they do ("Save changes", not "OK"). Confirmation dialogs only for destructive or irreversible actions, and they name the consequence.
- Write errors as: what happened, why (if useful), what to do.

## Avoiding generic AI-looking interfaces

Generic output comes from defaults: centered hero, purple gradients, emoji icons, identical rounded cards, three-column feature grids, and vague copy. Instead:
- Start from the product's context and audience; pick a deliberate typographic pairing and a restrained palette tied to the brand.
- Use real content and real data shapes during design, not lorem ipsum.
- Make one strong layout decision per page (asymmetry, density, a distinctive navigation) rather than many small decorative ones.
- Motion only with purpose (`creative-frontend` skill).
- Usability beats novelty: never trade clarity, contrast or accessibility for an effect.

## Companion design skills

When installed, use them for visual direction and audits, and keep this skill for structure and consistency: `anthropics/skills` `frontend-design` (visual direction), `vercel-labs/agent-skills` `web-design-guidelines`, `pbakaus/impeccable` (audits; review its scripts first), `emilkowalski/skills` (motion and polish). See the repository's `docs/research.md`.

## Where visual criteria live

This file owns the architecture of a design system: tokens, states, consistency and governance. The visual decisions themselves (direction, composition, typography choices, color roles, identity, avoiding generic interfaces) are in the `creative-frontend` skill's `visual-design.md`; dense enterprise screens (dashboards, long forms, high-volume tables, navigation, notifications) in its `enterprise-application.md`; grids, breakpoints, density and internationalization room in `layout-and-responsive.md`; motion tokens and timing in `motion-design.md`. Read those when the question is "how should it look"; read this file when the question is "how do we encode and keep it consistent".

## Token architecture for multi-brand and multi-tenant products

- **Three tiers stay**: primitives (`blue-600`, `space-4`), semantic roles (`color-bg-surface`, `color-text-muted`, `color-action-primary`), component tokens only where a component needs its own knob. Brands and tenants change values in the primitive and semantic tiers; components never change.
- **Accent ramp as the tenant variable**: generate a 9 to 11 step ramp from one brand color in a perceptual color space (OKLCH) at build time or at runtime (CSS `oklch()` with `relative color syntax` where browser support allows; otherwise precomputed per tenant). Semantic tokens alias ramp steps (`color-action-primary: var(--accent-600)`, `color-action-primary-hover: var(--accent-700)`, `color-bg-accent-subtle: var(--accent-50)`). Every step used for text on white or white on step must keep the contrast targets; verify the generated ramp in CI for each tenant color.
- **Semantic aliasing** keeps dark mode cheap: dark mode redefines semantic values (`color-bg-surface`, `color-text-primary`, elevated surfaces lighter), not component styles. Accent ramps in dark mode are desaturated and shifted one step lighter for text.
- **Nuxt UI**: brand colors map through `app.config.ts` (`ui.colors.primary` and friends) onto Tailwind color names; tenant theming sets the CSS custom properties Nuxt UI reads (`--ui-primary` and the color ramp variables) on `<html>` per request, so a single build serves every tenant. Keep tenant values out of the client bundle; inject them from the server (cookie/host → runtime values) to avoid flashes.
- **shadcn/ui**: tokens are the CSS variables in the theme block (`--background`, `--primary`, `--primary-foreground`, radius); multi-brand means one variable set per brand applied on a wrapper or `<html>`, and `components.json` unchanged. Dark mode is the `.dark` variable set.
- **Framework-agnostic source**: when Nuxt and Next.js apps must match, the ramp and the semantic values are generated from one JSON (Style Dictionary or a small script) into CSS variables consumed by both; components are implemented per framework (`microfrontends.md`).
- **What never varies per tenant**: spacing, type scale, radius, elevation, motion tokens, iconography. Allowing a tenant to change density or fonts creates N products.

## The reference applications: one contract, two libraries

The verification apps show the mapping in use (1.5 increment 5). Both consume `verification/design/contracts/atlas-logistics.json` through files `verification/extract.mjs` generates; neither edits a token by hand.

- **Nuxt (Nuxt UI 4.12)**: a harness layer adds the module and `app/assets/css/main.css` imports Tailwind, Nuxt UI, the generated `tokens.css` (Tailwind theme: ramps, roles, scales, dark variant), the generated `nuxt-ui-map.css` (`--ui-bg`, `--ui-text`, `--ui-border`, `--ui-primary`, `--ui-radius`… from the roles) and the self-hosted fonts; `app.config.ts` maps Nuxt UI's semantic colours onto the contract's ramp names (`primary: 'accent'`, `error: 'danger'`); `<UApp>` wraps the app; dark mode is the colour-mode module's `.dark` class, which the role variables answer to. Product code uses the role utilities (`bg-canvas`, `text-fg-muted`, `border-border-strong`) next to Nuxt UI's components.
- **Next (shadcn/ui on Radix, Tailwind v4)**: `postcss.config.mjs`, `components.json` (style radix-nova, CSS variables) and `src/app/globals.css`, which imports Tailwind, the generated `tokens.css` (roles prefixed `dc-` because shadcn owns `--accent`, `--border` and friends for other meanings), the fonts, shadcn's stylesheet, and then aliases shadcn's variables onto the roles (`--background: var(--dc-canvas)`, `--primary: var(--dc-accent)`, `--ring: var(--dc-focus)`, `--input: var(--dc-border-strong)`, the muted and hover surfaces on ramp steps per theme, the chart colours on the ramps). Product code uses shadcn's vocabulary (`bg-background`, `text-muted-foreground`, `bg-primary`) and the `dc-` utilities for roles shadcn lacks (`text-dc-success`). The theme is the `.dark` class set before paint by an inline script from the stored or system preference.
- **The design page** (`/design` in both apps) is the living documentation: it reads the contract and the computed styles back, lists every role with the colour the stylesheet applies and the ratio each pair reaches in the active theme, the type scale, spacing, radius, elevation, motion and the interactive states. `verification/browser/design-checks.mjs` asserts on it: the applied roles equal the contract's resolved roles in light and in dark, the choice persists across a reload, every pair passes, every control has a focus indicator at 3:1, reduced motion cuts the animations, every text grades by CSS or by the bound, and the plugin's `browser-audit` (axe, keyboard, responsive at mobile, desktop and 320 px with text at 100% and 200%) reports no confirmed finding.
- **A finding the mapping surfaced**: the default `:focus-visible` ring of Nuxt UI 4.12's buttons and inputs as rendered here is the component's own colour at 25% alpha, 3 px with no offset: 1.45:1 on the primary button, 1.72:1 on a neutral one (SC 1.4.11 asks 3:1); shadcn's default is a 50% ring colour. Both apps therefore apply the contract's ring to every `:focus-visible` element in an unlayered rule (a solid 2 px ring in the `focus` role with a 2 px offset), which wins over the libraries' layered utilities. A design system that adopts a library inherits its focus styles: measure them.

## Component API conventions

- **Variants and sizes** named by role, not appearance: `variant="primary | secondary | ghost | danger"`, `size="sm | md | lg"`; never `blueButton` or `big`.
- **States** are props or data attributes with one source of truth: `disabled`, `loading`, `invalid`, `selected`; the component renders the visual state and the ARIA state from the same prop.
- **Composition over configuration**: slots (Vue) and `children`/compound components (React) for content; booleans only for behavior. A component with twelve boolean props is three components.
- **Controlled and uncontrolled** forms clear: `v-model`/`defineModel` in Vue, `value` + `onChange` or `defaultValue` in React, documented per component.
- **Escape hatches** are explicit (`class`/`className` pass-through, `as`/`is` polymorphism, `unstyled`) and discouraged in product code reviews.
- **Accessibility is part of the API**: required `label` or `aria-label` props on icon-only controls, `id` wiring through `useId`, keyboard behavior documented.
- **Deprecation** happens through a `deprecated` JSDoc tag, a console warning in development, and a migration note; the old API survives at least one minor release.

## Documentation and governance

- **Living documentation**: Storybook (React, Vue) or Histoire (Vue) with one story per state and variant, real content, dark mode and RTL toggles, and the accessibility addon. Stories are also the fixtures for visual regression (`testing-scenarios.md`).
- **Visual tests** on the design system, not on every screen: Playwright or Chromatic screenshots of stories, animations disabled, fonts preloaded, deterministic data.
- **Contribution rules**: a component enters the system when it is used by two features or two apps; proposals include the use cases, the API, the states and the accessibility behavior; product code may not restyle primitives with deep selectors.
- **Versioning the package** (monorepo `packages/ui`): semantic versions; breaking changes are visual as well as programmatic (a radius change is a major for a white-label product); a changelog per release; consumers upgrade through Renovate with visual tests on the preview.
- **Ownership**: one named owner for the system, a review rota, and a quarterly audit of drift (components re-implemented in features, literal colors and sizes in product code; `component-complexity.mjs` and a grep for raw hex values find them).
- **Deletion policy**: unused components (Knip plus story usage) are removed after one deprecation cycle; the system stays small enough to be known by heart.
