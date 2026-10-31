# Landing and launch pages

A launch page has one job: say what the product is, show it, and make the one action easy. Everything else (motion, 3D, long copy) earns its place only if it explains the product or carries the brand at a moment the reader expects. This reference is the method the skill applies to a premium landing: how the page is structured, how it stays fast and legible on a phone, where motion belongs, and what a browser check can prove about it. The reference implementation is Lumen, `/landing` in the Next verification app, built from the `lumen-notebook` contract (`references/design-contract.md`) and checked by `verification/browser/landing-checks.mjs`.

## Contents
- Start from the contract
- Structure: one sentence, three ideas, one action
- Typography and layout that read as editorial
- Motion that explains
- Fast on a phone: no layout shift, no network for the look
- The action in every section
- Dark mode on a page designed for light
- Forms on a landing
- What the browser check proves
- What stays with the human
- Checklist

## Start from the contract

A landing is where generic AI design shows first: a centred hero, a gradient, three feature cards with icons, a testimonial carousel. The contract prevents it by forcing decisions before pixels: who reads the page and where (a phone in transit, a laptop at night), which three ideas it must land, the one action, the typographic voice (a real serif for headlines, a measure, a fluid display step), the colour roles (cream and ink, one accent), the motion policy with reduced motion decided, the imagery policy ("rendered product, lit from the left, no people, no stock"). Validate the contract with `design-contract.mjs` and emit its tokens; when the page lives inside an app whose theme belongs to another contract, emit them scoped (`--scope '[data-contract="lumen"]'`).

## Structure: one sentence, three ideas, one action

In order, each a labelled `<section aria-labelledby>`:

1. **Hero.** An `h1` that says what the product is in one sentence, a line of support, the action, and the product shown (not a stock scene). No carousel.
2. **One section per idea**, three at most, alternating text and image on a 12-column grid: the headline starts on column 2, the image bleeds to the edge on alternate sections. Each idea's headline fits on one line on a desktop.
3. **The sheet**: a real table of specifications, not icon tiles.
4. **The action**: the form or the purchase, with the price and what happens next in plain words.
5. **Questions**: native `<details>` accordions, four to six.
6. **Footer** with the few links that matter.

The page should read in about two minutes. If it needs a sticky table of contents, it is too long.

## Typography and layout that read as editorial

- The display size is fluid (`clamp()` from the contract), headlines in the serif with tight leading, body at 18 px with a 1.6 line height and a measure of about 62 characters (`max-w-[62ch]`).
- Nothing is centred by default; asymmetry comes from the grid. Section spacing is generous (96 to 160 px on a desktop) and spacing inside text blocks tight.
- Sharp radii if the contract says so; depth from the product's lighting, not from shadows.
- Use `text-balance` on headlines and keep each idea's headline short enough for one line at 1280 px (the check measures it).

## Motion that explains

`creative-frontend/references/motion-engineering.md` has the engineering; the landing rules on top of it:

- **One intro, once.** The notebook opens on load (480 ms); the headline and the action settle after it. Never on every scroll, never on hover.
- **Scroll-bound motion explains the product.** In Lumen, ink strokes draw themselves along the scroll of the archive section (`stroke-dashoffset` scrubbed by ScrollTrigger with `pathLength="1"`), because the product's point is that a page writes itself into the archive. A parallax of flat images explains nothing.
- **Once-only reveals** (the battery bar fills when its section arrives) use `once: true`; the trigger removes itself, and a check must expect that on re-entry.
- **Reduced motion is a branch, not a shorter duration.** `gsap.matchMedia` with the preference: the reduce branch sets the final frames (`gsap.set`) and creates no ScrollTrigger. The page must say the same thing with and without motion.
- **Cleanup is total.** `useGSAP` with a scope, the MatchMedia reverted on unmount; a route change leaves zero triggers, zero pin spacers, zero DOM tweens. The page exposes diagnostics (`window.__lumen`: mounts, reverts, the branch taken, live triggers and tweens) so the check reads state, not screenshots.
- Hover and focus are CSS at 200 ms; the sticky elements never animate.

3D is optional and only when the product is physical and the shot cannot be drawn: then it follows `creative-frontend` with a DOM equivalent, lazy loading and a reduced-motion still.

## Fast on a phone: no layout shift, no network for the look

- Fonts self-hosted (`@fontsource-variable`), loaded by the app's stylesheet; no font service.
- The product art is inline SVG in a fixed aspect box (`aspect-[4/3]`); photographs, when used, have width and height and two sizes in fixed boxes. The check measures cumulative layout shift from the first paint through the intro and a scroll and requires it under 0.05.
- The header is sticky but light; the phone bar is one line.
- Everything reads at 320 px and at 200% text: no fixed `rem` widths on controls (they double with the text), explicit `grid-cols-1` on single-column grids (an implicit column is auto-sized by its content and overflows), `min-w-0` on grid children that hold media.

## The action in every section

The pre-order is visible everywhere without shouting: a quiet link in the header on a desktop, a sticky bottom bar on phones (44 px targets) that never covers a focused control (`scroll-padding-bottom` while the page is mounted, bottom padding on `main`), and a text link at the end of each idea. One primary button on the page: in the hero and in the form.

## Dark mode on a page designed for light

The page follows the system; the roles come from the contract's dark set (graphite canvas, cream text, the accent lifted two steps). Product art keeps its own tone (paper stays paper). The check emulates the dark scheme and compares the applied canvas and foreground with the contract's resolved dark roles.

## Forms on a landing

Short: email and a choice. Validate on submit, put the message under the field linked with `aria-describedby` and `aria-invalid`, move focus to the field, confirm in a `role="status"` region that names what was chosen. Say what is sent and when. A reference page that stores nothing says so in the form.

## What the browser check proves

`landing-checks.mjs` (run by `verification/next/check-landing.mjs` on the production build): one `h1`, the landmarks, the form, the art and the title in the server HTML; mount once on the motion branch with the intro done and at least two triggers; the strokes undrawn before and drawn after the archive scrolls by; layout shift under 0.05; the finish radios changing the product; the form's empty submit (invalid, linked, focused) and valid submit (status with the finish); Tab reaching the skip link first and the pre-order link; a question opening with Enter; the route change reverting every trigger and tween, re-entry recreating them without accumulation; idea headlines on one line at 1280 px; under reduced motion the final frames with zero triggers and nothing running; the phone bar at the bottom with a 44 px action, the art's aspect ratio kept, no overflow at 375 and 320 px; the dark roles equal to the contract's; legibility graded in both themes; `browser-audit` with zero confirmed findings at three viewports and two text scales.

## What stays with the human

Whether the sentence is the right sentence, whether the three ideas are the ones the audience cares about, whether the illustration is good enough to carry a hero, whether the price reads as fair: the check cannot say. Review the page at 375 and 1280 px, in both themes, with the motion on and off, and read it aloud once.

## Checklist

- [ ] A validated contract; tokens emitted (scoped if the page lives inside another theme)
- [ ] One `h1` sentence that says what it is; the product shown, drawn or photographed to the imagery policy
- [ ] Three ideas at most, one section each, alternating on the grid; a real specs table; native `<details>` questions
- [ ] Display size fluid; serif headlines on one line per idea at a desktop; 62-character measure
- [ ] Intro once; scroll-bound motion that explains; `once` reveals; reduced motion as a branch with final frames; total cleanup; diagnostics exposed
- [ ] No layout shift: fixed aspect boxes, self-hosted fonts, no network for the look
- [ ] The action in every section; a 44 px phone bar that never covers focus
- [ ] Dark roles from the contract; art keeps its tone
- [ ] The form validates, links its message, moves focus, confirms in a status region, says what is stored
- [ ] The browser check passes; the human review done at two widths, two themes, motion on and off
