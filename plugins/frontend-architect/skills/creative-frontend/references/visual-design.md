# Visual design

Criteria for deciding how a product looks, before any component is written. Token architecture, component libraries and accessibility rules live in the `frontend-architect` skill (`design-systems.md`, `component-libraries.md`, `accessibility.md`); this file owns visual judgment. Enterprise patterns (dashboards, dense tables, long forms) are in `enterprise-ui-patterns.md`; layout and breakpoints in `layout-and-responsive.md`; motion in `motion-design.md`.

## Contents
- Art direction procedure
- Composition
- Hierarchy
- Typography
- Spacing rhythm
- Color
- Identity
- Restraint rules
- Avoiding generic interfaces
- Screen review checklist

## Art direction procedure

Decide the direction once, in writing, and let every later choice answer to it.

1. **Product**: what the user does here (operate, read, buy, decide, monitor) and how often (daily tool vs occasional visit).
2. **Audience**: expertise, device, environment (field worker on a phone in sunlight; analyst on two monitors; patient on a tablet).
3. **Context**: brand constraints, regulatory tone (medical, financial), existing visual language, competitors to differ from.
4. **Direction statement**, three lines maximum. Example for an ERP: "Quiet and dense. The data is the interface; chrome recedes. Color appears only to signal status or the one primary action." Example for a product launch site: "Editorial and spacious. One large image per section, strong serif headlines, a single accent."
5. **References as words**, not screenshots to copy: "the restraint of a well-set annual report", "the density of a trading terminal without its color noise".

Before any component, decide: type pairing and scale, spacing base, the color roles and one accent ramp, radius and elevation policy, icon set, density mode, and whether dark mode exists. These become tokens (`design-systems.md`); the decisions themselves are the design.

A direction is wrong when it serves the designer instead of the task: a dashboard that "looks premium" but needs a scroll to see the number the user came for.

## Composition

- **Focal point**: each view has one element the eye lands on first (the key metric, the headline, the primary form). If two elements compete, demote one.
- **Visual weight**: size, contrast, saturation and isolation add weight. Spend weight on meaning, not decoration. A bright button next to a bright illustration cancels both.
- **Alignment**: everything sits on a shared grid and on shared text baselines where possible. Misalignment of 2 px reads as sloppiness even when unnoticed consciously.
- **Negative space**: space groups and separates; it is not emptiness to fill. Related items sit closer than unrelated ones (proximity beats borders and boxes).
- **Asymmetry**: one deliberate asymmetric decision per view (an off-center hero, a wide left column, a pulled-out quote) gives character. Several at once produce noise.
- **Edges**: respect the container. Content that touches the viewport edge on mobile needs intent, not accident.

## Hierarchy

Four levers, in order of cost: **position** (top-left in LTR reads first), **size**, **weight**, **color**. Use the cheapest lever that works; reserve color for state and action.

- One primary action per view, visually distinct; secondary actions quieter; destructive actions never the most prominent.
- Headings form an outline: a reader scanning only headings understands the page. Skipping levels for visual effect breaks screen readers and the outline alike.
- In data-heavy views the hierarchy is: the number that drives a decision → its context (trend, target, period) → the breakdown → the controls.
- Labels are quieter than values. Metadata (dates, ids, counts) is quieter than content.

## Typography

| Role | Choose for | Typical |
|---|---|---|
| UI text (controls, tables, labels) | Legibility at 12 to 16 px, tabular figures, many weights not needed | A humanist or neo-grotesque sans; system fonts are a legitimate enterprise choice |
| Reading text (articles, help, legal) | Long-form comfort, 16 to 20 px, 60 to 75 characters per line | A text serif or a sans with generous x-height |
| Display (marketing headlines) | Character at 40 px and above; used sparingly | A distinctive serif, slab or display sans |

Rules:
- One family for UI, optionally one for display. A third family needs a reason (code, a brand wordmark).
- **Scale**: a modular ratio between 1.2 and 1.25 for applications (small steps, many sizes close together are needed in dense UI); 1.333 to 1.5 for marketing and editorial. Define 6 to 8 steps as tokens and never use a size outside them.
- **Line height**: 1.4 to 1.6 for body; 1.1 to 1.25 for headlines; tighter as size grows.
- **Measure**: 45 to 75 characters for reading text; tables and forms are exempt but labels still wrap sensibly.
- **Numerals**: `font-variant-numeric: tabular-nums` for any column of numbers, timers, prices and ids so digits align; proportional numerals in prose.
- **Weight**: two or three weights (regular, medium, semibold/bold). Bold everywhere equals bold nowhere.
- **Case and tracking**: all-caps only for short labels, with slight positive letter-spacing; never for sentences.
- **Loading**: self-host, subset, `font-display: swap` or `optional`; declare metric-compatible fallbacks (`size-adjust`, `ascent-override`) to avoid layout shift; preload only the one file the first paint needs (`performance.md`).
- **System font stacks** (`system-ui, -apple-system, Segoe UI, Roboto, …`) are a strong default for internal tools and privacy-sensitive products: zero network cost, native rendering, no third-party origin.

## Spacing rhythm

- Base unit 4 px; most spacing on the 8 px grid (4, 8, 12, 16, 24, 32, 48, 64, 96). Tokens, not literals.
- Inside a component spacing is tighter than between components; between sections tighter than between page regions. A visible ratio (for example 1 : 2 : 4) makes grouping legible without borders.
- **Optical adjustments**: icons next to text sit on the x-height, not the cap height; round shapes and triangles extend slightly beyond the box to look aligned; buttons with an icon on one side get asymmetric padding.
- Density is a mode, not a mood: `comfortable` and `compact` scales switch together (`layout-and-responsive.md`).

## Color

Define colors by **role**, then assign values:

| Role | Examples | Notes |
|---|---|---|
| Surface | page, raised, overlay, inset | 2 to 4 steps are enough; separation by subtle value difference and shadow |
| Text | primary, secondary, muted, inverse, link | muted still meets 4.5:1 |
| Border | default, strong, focus | focus ring 3:1 against adjacent colors |
| Accent | the brand or action color and its ramp | one ramp of 9 to 11 steps; buttons, links, selection, charts' first series |
| Semantic | success, warning, danger, info | each with a text, a surface and a border step; never meaning by color alone |

- **Contrast**: 4.5:1 for text, 3:1 for large text (24 px, or 19 px bold) and UI components (`accessibility.md`). Check the muted text and the placeholder color; they fail most often.
- **Accent ramp**: generate it in a perceptual space (OKLCH) so steps are evenly spaced; keep a step that passes 4.5:1 as white-on-accent for buttons, and a light step for tinted backgrounds. A single ramp also serves **tenant theming**: swap the ramp, keep every other token.
- **Saturation budget**: large areas desaturated, saturation reserved for small signals. Enterprise interfaces live mostly in grays with one accent.
- **Dark mode** only when the product needs it (night-time operation, developer tools, media, OS-integrated apps, explicit demand). Derive it from the same roles with new values: lower surface contrast, desaturated accents (bright saturated colors vibrate on dark), elevated surfaces lighter not darker, shadows replaced by surface steps. Test both modes for every state; if you cannot maintain two palettes, ship one.
- Charts use a categorical palette of at most 6 distinguishable hues, plus sequential and diverging scales from the accent ramp (`charts.md`).

## Identity

A product looks "like itself" through a few consistent signature decisions, not through decoration:

- One **radius policy** (sharp, slightly rounded, pill for chips) applied everywhere; mixed radii look unfinished.
- One **elevation policy**: borders or shadows, rarely both; two or three shadow steps defined as tokens.
- One **icon set**, one stroke width, one size scale, aligned to text; no mixing outline and filled sets.
- An **illustration policy**: none, or a consistent style used only for empty states and onboarding; never stock-style decorative people in operational screens.
- A **voice** in copy (`design-systems.md`, UX writing): the words are part of the look.
- One or two **signature moments** (a distinctive navigation, a particular data visualization, a brand typeface in headings) carry identity; everything else is quiet.

## Restraint rules

- No gradients, glassmorphism, glows, 3D or animation by default. Each is allowed when it carries meaning or brand at a moment the user expects it (`motion-design.md`), and never in dense operational screens.
- Decoration competes with data. In dashboards and forms, remove until removing hurts.
- Borders, backgrounds and shadows are grouping tools; use one of them per level, not all three.
- Icons accompany text; icon-only controls are an exception that requires a tooltip and an accessible name.
- Images of text, decorative dividers and emoji as icons are not allowed in product UI.

## Avoiding generic interfaces

Generic output is the sum of defaults. Each default has a named alternative:

| Generic default | Why it reads as generic | Do instead |
|---|---|---|
| Centered hero, huge headline, two buttons | Template signature; no relation to the product | Lead with the product itself (a real screenshot, a live demo, the data) and a headline that states a specific outcome |
| Three equal cards in a row with icons | Content forced into a grid regardless of meaning | Rank the content; give the most important item more space; use a list or a two-column layout when items are unequal |
| Purple-to-blue gradient | Default accent of a generation of tools | One accent chosen for the brand and role, flat; gradients only as a deliberate brand asset |
| Emoji or generic line icons as decoration | No information, inconsistent rendering | Text, real data, product imagery, or a consistent icon set used functionally |
| Identical rounded cards with soft shadows everywhere | Everything is a card, nothing is grouped | Group by proximity and alignment; cards only for repeatable, self-contained items |
| Vague copy ("Powerful. Simple. Secure.") | Says nothing verifiable | Specific claims with units, examples and constraints |
| Stock illustrations of people at laptops | Interchangeable | Product screenshots, diagrams of the actual workflow, or nothing |
| Everything animated on scroll | Motion without purpose | Static layout; motion only for state change and one brand moment (`motion-design.md`) |
| Dark theme with neon accents by default | Mood over function | Theme chosen by use context; light by default for operational tools |
| Full-bleed background images behind text | Contrast and reading cost | Images as content with their own space; text on solid surfaces |

The test: cover the logo. If the page could belong to any product, it is generic.

## Screen review checklist

- [ ] The direction statement is recognizable in this screen
- [ ] One focal point; one primary action
- [ ] Type sizes, weights and spacing come from the scales; nothing hand-tuned outside tokens
- [ ] Line length and line height fit the role of the text
- [ ] Numbers in tabular figures; units and periods visible
- [ ] Color used for state and action only; meaning never by color alone; contrast checked including muted text and focus rings
- [ ] Grouping by proximity and alignment before borders and boxes
- [ ] Icons from one set, with labels or accessible names
- [ ] Loading, empty, error, partial and success states designed (`enterprise-ui-patterns.md`)
- [ ] Looks correct at 320 px, 1440 px and 200% zoom (`layout-and-responsive.md`)
- [ ] No decoration that would survive the "cover the logo" test as generic
- [ ] Motion, if any, passes the purpose test (`motion-design.md`)
