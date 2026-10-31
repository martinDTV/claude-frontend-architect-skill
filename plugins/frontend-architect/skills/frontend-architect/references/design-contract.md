# The design contract: from requirements to tokens, with proof

How a product brief becomes a visual direction that can be explained, checked and built in Nuxt UI or shadcn/ui without
starting from the same template every time. The method writes one file, the **design contract**, and the tool
`scripts/design-contract.mjs` proves what a file can prove about it; the judgement about whether the direction is right
for the product stays with people (`creative-frontend`'s `visual-design.md` owns the criteria, `creative-quality-rubric.md`
the review).

## Contents

1. Why a contract
2. The method: requirements → decisions → scales → roles
3. The file
4. What the tool proves and what it only flags
5. Emitting tokens: CSS, Tailwind v4, Nuxt UI, DTCG
6. Mapping onto Nuxt UI and shadcn/ui
7. Governance: versions, drift, what never varies
8. Three worked contracts

## 1. Why a contract

Generic interfaces are the sum of defaults nobody decided: a violet accent, rounded cards with shadows, three equal
columns, a centred hero. The cure is not taste in the abstract; it is a short list of decisions, each answering to a
requirement of this product and these users, written before the first component. The contract is that list in a form
tools can read: a validator checks traceability, grids and contrast; emitters turn its scales and colour roles into the
tokens the component library consumes. Two apps in two frameworks built from the same contract share the design without
sharing a component line.

## 2. The method

1. **Product and audience** (`visual-design.md`, art direction procedure): what the user does here and how often, on which device, in what environment. Two or three audiences at most.
2. **Requirements as sentences** with ids (`R1`…): the visual consequences of the product, not features. "Dispatchers must see what needs attention without scrolling" is a requirement; "a dashboard" is not.
3. **Direction statement**, three lines at most, plus three adjectives and references *as words*. Every later decision must be recognisable in it.
4. **Decisions**, one per area, each citing the requirements that justify it: typography, color, spacing, layout, density, radius, elevation, motion, imagery, states, dark-mode, accessibility, responsive. A default is a decision too; write the one-liner. A decision that cites nothing is the start of a generic interface.
5. **Scales**: type ratio and steps (fluid from a chosen step), spacing base and the values the product may use, radius and elevation levels, motion durations and easings, breakpoints chosen by content.
6. **Colour roles**, light and dark: one accent seed, a neutral tinted from a seed, four status seeds; the tool builds perceptual ramps (OKLCH, in gamut) and the roles reference ramp steps (`{accent.700}`) or literals. The roles are the vocabulary components use; ramps and seeds never appear in product code.
7. **Validate**, fix the pairs the tool rejects (the fix is a different ramp step, not a weaker requirement), then **emit** the tokens for the stack in use.

The order matters: steps 1–3 decide what the product should feel like, 4 ties every choice to that, 5–6 make it buildable, 7 makes it checkable. Starting at 5 (a palette first) is how the same purple appears in every project.

## 3. The file

```jsonc
{
  "name": "atlas-logistics", "version": 1,
  "product": { "kind": "operate | read | buy | decide | monitor", "summary": "…", "frequency": "daily | weekly | occasional" },
  "audience": [{ "who": "…", "device": "desktop | tablet | phone | mixed", "environment": "…" }],
  "requirements": [{ "id": "R1", "text": "…" }],
  "direction": { "statement": "three lines at most", "adjectives": ["…"], "references": ["as words, not screenshots"] },
  "decisions": [{ "area": "typography", "choice": "…", "because": ["R1", "R3"] }],
  "typography": { "families": { "sans": ["Inter Variable", "system-ui", "sans-serif"] }, "ratio": 1.2, "baseRem": 1,
                  "steps": { "xs": -2, "sm": -1, "base": 0, "lg": 1, "xl": 2, "2xl": 3 },
                  "fluid": { "minViewport": 320, "maxViewport": 1440, "fromStep": 2, "minRatio": 1.15 },
                  "lineHeights": { "tight": 1.2, "body": 1.5 }, "weights": { "regular": 400, "semibold": 600 }, "tabularNumbers": true },
  "spacing": { "base": 4, "scale": [0, 4, 8, 12, 16, 24, 32, 48, 64] },
  "layout": { "container": 1440, "gutter": 24, "sidebar": 272, "breakpoints": { "sm": 640, "md": 768, "lg": 1024, "xl": 1280 } },
  "radius": { "policy": "sharp | soft | round", "scale": { "sm": 4, "md": 6, "lg": 10, "full": 9999 } },
  "elevation": { "policy": "flat | layered", "levels": [{ "name": "popover", "y": 4, "blur": 12, "spread": -2, "alpha": 0.18 }] },
  "density": "compact | comfortable | spacious",
  "motion": { "durations": { "fast": 120, "base": 200, "slow": 320 }, "easings": { "standard": [0.2, 0, 0, 1] }, "reducedMotion": "cut | minimal" },
  "color": { "accent": "#1f4e8c", "neutral": { "seed": "#1f4e8c", "chroma": 0.08 },
             "status": { "success": "#2f8a5b", "warning": "#b8791f", "danger": "#c23b3b", "info": "#2b6fc9" },
             "roles": { "light": { "canvas": "{neutral.50}", "fg": "{neutral.900}", "accent": "{accent.700}", "…": "…" }, "dark": { "…": "…" } } },
  "states": { "focusRing": { "width": 2, "offset": 2 }, "minTarget": 24, "disabledOpacity": 0.5, "hover": "one ramp step darker" },
  "darkMode": true,
  "imagery": { "policy": "…" }
}
```

The eighteen roles every theme defines: `canvas`, `surface`, `surface-raised`, `fg`, `fg-muted`, `border` (dividers, no ratio), `border-strong` (control boundaries, 3:1), `accent`, `accent-fg`, `accent-hover`, `focus`, and `success`, `warning`, `danger`, `info` each with its `-fg`. Components never use a ramp step directly: a surface that needs a tint asks for a role, and the role is added to the contract.

## 4. What the tool proves and what it only flags

`node scripts/design-contract.mjs contract.json [--json|--md]`

| Finding | Level | Means |
|---|---|---|
| `contract-missing-section` | confirmed | a required section is absent |
| `direction-statement-too-long` | confirmed | more than three lines: it will not be remembered |
| `decision-without-requirement` | confirmed | a decision cites nothing or an unknown id |
| `spacing-off-grid` | confirmed | a spacing value is not a multiple of the base |
| `semantic-role-missing`, `semantic-reference-unresolved` | confirmed | a theme lacks a role, or a role points at a ramp step that does not exist |
| `contrast-pair-below` | confirmed | a semantic pair is below its WCAG 2.2 ratio in a theme, computed from the resolved colours (4.5:1 for text pairs, 3:1 for boundaries, focus and non-text indicators; the default list covers body and secondary text on every surface, labels on the accent and the four status surfaces, the accent as text, control boundaries and the focus ring) |
| `focus-ring-too-thin`, `target-size-below`, `reduced-motion-undecided` | confirmed | floors: 2 px ring, 24 px targets (SC 2.5.8), a reduced-motion policy whenever motion exists |
| `requirement-without-decision` | heuristic | a requirement drives nothing: not visual, or a decision is missing |
| `area-without-decision` | heuristic | an area was left to defaults without saying so |
| `type-scale-ratio-unusual` | heuristic | outside 1.067–1.5 |
| `generic-accent-hue` | heuristic | the accent sits in the violet band generated interfaces default to; fine only if the brand owns it and the colour decision says so |

Confirmed findings are facts about the file. Heuristics are leads. Nothing here says the direction is good: that is the human half of `creative-quality-rubric.md`, with the screenshots.

## 5. Emitting tokens

`--emit css` writes `:root` custom properties (ramps `--color-accent-700`, roles `--color-fg`, type `--text-xl` with `clamp()` above the fluid step, `--space-*`, `--radius-*`, `--shadow-*`, `--duration-*`, `--ease-*`, breakpoints, focus ring, targets) and a `.dark, [data-theme="dark"]` block that redefines the roles only. `--emit tailwind` writes the same as a Tailwind v4 stylesheet: scales in `@theme` (so `text-xl`, `rounded-md`, `shadow-popover`, `ease-standard`, `bg-accent-700` exist), roles as plain variables per theme and an `@theme inline` block that exposes them as colours (`bg-canvas`, `text-fg`, `text-fg-muted`, `border-border-strong`, `ring-focus`), plus a `dark` custom variant driven by the class or `data-theme`. `--emit nuxt-ui` writes the mapping of Nuxt UI's `--ui-*` variables onto the roles and the `app.config.ts` colours. `--emit dtcg` writes a Design Tokens Format Module file (2025.10 draft: `$type`/`$value`, groups, `{color.accent.700}` aliases, colours as sRGB components with the hex, dimensions and durations with units, cubic-bezier easings, shadow composites; fluid sizes carry min and max with the `clamp()` in `$extensions`) for tools that speak it.

The emitters print to stdout; the build writes the file where the app reads it (`verification/extract.mjs` does this for the reference apps). Generated files are never edited.

## 6. Mapping onto Nuxt UI and shadcn/ui

- **Nuxt UI 4**: the Tailwind theme from the contract provides colour names `accent`, `neutral`, `success`, `warning`, `danger`, `info` with 50–950 steps; `app.config.ts` maps Nuxt UI's semantic colours onto them (`primary: 'accent'`, `error: 'danger'`); the `nuxt-ui` emit sets `--ui-bg`, `--ui-text`, `--ui-border`, `--ui-primary`, `--ui-radius` and friends from the roles so every component follows the contract in both themes; dark mode is `@nuxtjs/color-mode`'s `.dark` class, which the same role variables answer to. Component slot overrides stay in `app.config.ts`; product code uses role utilities, not ramp steps.
- **shadcn/ui (Next)**: shadcn's own variables (`--background`, `--foreground`, `--primary`, `--border`, `--ring`, `--radius`) are aliased to the roles in `globals.css` (`--background: var(--canvas)`, `--primary: var(--accent)`, `--ring: var(--focus)`), so the copied components inherit the contract and the `.dark` block of the contract drives their dark mode. New product components use the role utilities directly.
- **Both**: typography families are self-hosted (`@fontsource-variable/*`, OFL), the fluid sizes come from the `--text-*` variables, spacing stays on the contract's scale (a discipline the audit checks, not something the utility engine can enforce), motion uses `--duration-*` and `--ease-*`, and `prefers-reduced-motion` applies the contract's policy globally.

## 7. Governance

- The contract is versioned; a change to a role, a scale or a decision bumps `version` and lands with the regenerated tokens in the same commit. The validator runs in CI next to the tests.
- Drift is measured, not felt: raw colours, sizes and shadows in product code are what the consistency audit looks for (`ui-audit`'s `tokens` family, 1.5 increment 5, block E); a finding there is either a missing role to add to the contract or a line to fix.
- What never varies per product inside one organisation: the accessibility floors (ratios, ring, targets, reduced motion) and the role vocabulary. Everything else (families, ratios, seeds, radius and elevation policy, density) is the product's identity and is expected to differ: a logistics back office, a product launch page and a specialist shop share no visual default except those floors.
- A contract is reviewed by reading its decisions against the brief before any screen exists, and by the rubric's human half after the first screens exist; both reviews leave notes in the repository next to the contract.

## 8. Three worked contracts

`verification/design/contracts/` holds the contracts the reference applications are built from, each validating with zero confirmed findings, every decision citing requirements, all thirteen areas decided, 42 colour pairs passing in light and dark:

- **atlas-logistics** (operate, daily, desktop and phone): quiet and dense; Inter at 1.2, tabular numbers, fleet-blue accent, cool neutrals, compact density, flat elevation, soft 4–6 px radius, 120/200/320 ms, dark theme for night shifts. The enterprise application of block C.
- **lumen-notebook** (buy, occasional, mixed devices): editorial and spacious; Fraunces headlines at 1.25 with a fluid display size, Inter body at 18 px, cream canvas and graphite ink with one ink-blue accent, 8 px base with 96–160 px sections, sharp radius, flat elevation, a notebook-open reveal and ink strokes on scroll, light first. The landing page of block D.
- **ember-store** (buy, phone first): warm and exact; Fraunces for makers, Inter for everything operational, clay-tinted neutrals, terracotta accent for the bag only, 4:5 photographs on a strict grid, comfortable density, soft radius, menu and drawer as the only shadows, availability in words. The shop of block D.
