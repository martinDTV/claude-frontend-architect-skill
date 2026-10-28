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

This file owns the architecture of a design system: tokens, states, consistency and governance. The visual decisions themselves (direction, composition, typography choices, color roles, identity, avoiding generic interfaces) are in the `creative-frontend` skill's `visual-design.md`; dense enterprise screens (dashboards, long forms, high-volume tables, navigation, notifications) in its `enterprise-ui-patterns.md`; grids, breakpoints, density and internationalization room in `layout-and-responsive.md`; motion tokens and timing in `motion-design.md`. Read those when the question is "how should it look"; read this file when the question is "how do we encode and keep it consistent".

## Token architecture for multi-brand and multi-tenant products

- **Three tiers stay**: primitives (`blue-600`, `space-4`), semantic roles (`color-bg-surface`, `color-text-muted`, `color-action-primary`), component tokens only where a component needs its own knob. Brands and tenants change values in the primitive and semantic tiers; components never change.
- **Accent ramp as the tenant variable**: generate a 9 to 11 step ramp from one brand color in a perceptual color space (OKLCH) at build time or at runtime (CSS `oklch()` with `relative color syntax` where browser support allows; otherwise precomputed per tenant). Semantic tokens alias ramp steps (`color-action-primary: var(--accent-600)`, `color-action-primary-hover: var(--accent-700)`, `color-bg-accent-subtle: var(--accent-50)`). Every step used for text on white or white on step must keep the contrast targets; verify the generated ramp in CI for each tenant color.
- **Semantic aliasing** keeps dark mode cheap: dark mode redefines semantic values (`color-bg-surface`, `color-text-primary`, elevated surfaces lighter), not component styles. Accent ramps in dark mode are desaturated and shifted one step lighter for text.
- **Nuxt UI**: brand colors map through `app.config.ts` (`ui.colors.primary` and friends) onto Tailwind color names; tenant theming sets the CSS custom properties Nuxt UI reads (`--ui-primary` and the color ramp variables) on `<html>` per request, so a single build serves every tenant. Keep tenant values out of the client bundle; inject them from the server (cookie/host → runtime values) to avoid flashes.
- **shadcn/ui**: tokens are the CSS variables in the theme block (`--background`, `--primary`, `--primary-foreground`, radius); multi-brand means one variable set per brand applied on a wrapper or `<html>`, and `components.json` unchanged. Dark mode is the `.dark` variable set.
- **Framework-agnostic source**: when Nuxt and Next.js apps must match, the ramp and the semantic values are generated from one JSON (Style Dictionary or a small script) into CSS variables consumed by both; components are implemented per framework (`microfrontends.md`).
- **What never varies per tenant**: spacing, type scale, radius, elevation, motion tokens, iconography. Allowing a tenant to change density or fonts creates N products.

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
