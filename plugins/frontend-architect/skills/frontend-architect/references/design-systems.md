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
