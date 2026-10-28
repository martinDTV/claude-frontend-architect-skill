# Motion design

How to decide whether something moves, how long, with which curve, and how to prove it helped. Tool selection (CSS vs `<Transition>` vs Motion vs GSAP) follows the table in `SKILL.md`; resource cleanup and 3D lifecycle are in `animation-lifecycle.md`; GSAP specifics in `gsap.md`; scroll in `motion-scroll.md`.

## Contents
- The purpose test
- Duration and easing
- Choreography
- Microinteractions catalog
- Reduced motion policy
- Motion tokens
- Scroll-driven and cinematic work
- Performance
- Measuring
- Review checklist

## The purpose test

Motion is allowed when it does at least one of these, and nothing else:

1. **Explains** a change of state or place: an item leaving a list, a panel opening from the control that opened it, a value updating.
2. **Guides** attention to something the user needs now: a new error, a changed field, the next step.
3. **Expresses** the brand at a moment the user expects it: the first paint of a marketing page, a success celebration after a long task.

Frequency rule: the more often an interaction happens, the less it may animate. A menu used two hundred times a day gets 100 ms of opacity or nothing; a yearly onboarding may take a second. Operational screens (tables, forms, dashboards) default to no motion beyond state feedback.

## Duration and easing

| Interaction | Duration | Easing | Notes |
|---|---|---|---|
| Micro feedback (hover, press, toggle, focus ring) | 100 to 150 ms | ease-out | Perceived as instant; no delay |
| Enter (menu, tooltip, dropdown, toast) | 150 to 250 ms | ease-out (decelerate) | Entering elements slow down into place |
| Exit | 100 to 200 ms | ease-in (accelerate) | Exits are faster than entries |
| Layout change (expand, reorder, resize) | 200 to 400 ms | ease-in-out or a spring with low bounce | Longer when the distance is larger |
| Dialog / drawer | 200 to 300 ms | ease-out in, ease-in out | Backdrop fades with the panel |
| Page / route transition | 250 to 400 ms | ease-in-out | Only when it preserves context (shared element, direction) |
| Large hero or brand moment | up to 700 ms | custom curves | Once per session; skippable; respects reduced motion |

Rules: distance scales duration (small elements move faster); nothing in product UI exceeds 700 ms; springs are for physical metaphors (drag, dismiss) and need damping high enough to avoid visible oscillation on a toggle; `linear` only for progress indicators and marquees.

## Choreography

- **Stagger** children by 20 to 40 ms, capped at about 6 to 8 items; staggering a 50-row table makes users wait for data they can already see.
- **Shared axis**: elements in a sequence move along one axis in a consistent direction (forward: right or up; back: reversed).
- **Origin-aware**: menus, popovers and dialogs scale or slide from the control that opened them; toasts from the edge they live on.
- **Enter and exit are not symmetric**: exits are faster and simpler.
- **Overlap**: the next element starts before the previous one finishes (position parameters in timelines); sequential animations feel slow.
- **One thing at a time**: when several regions change at once, animate the one that matters and let the rest snap.

## Microinteractions catalog

| Element | Motion that feels right | Motion that feels wrong |
|---|---|---|
| Button | Press feedback within 100 ms (background/scale 0.98); loading state replaces the label without changing the width | Bounce, glow pulses, width jump when loading |
| Toggle / checkbox | Thumb slides 120 to 150 ms; check draws or fades quickly | Overshoot, color flash across the row |
| Input | Focus ring appears instantly; error message fades in 150 ms and stays | Shaking fields, animated label floating slower than typing |
| List add / remove | Item fades and collapses its height 200 ms; others move to fill | Items flying in from off-screen |
| Tabs | Indicator slides along the shared axis 200 ms; content cross-fades or snaps | Content sliding long distances on every tab change |
| Modal / drawer | Fade + small translate or scale from 0.96, 200 to 250 ms; backdrop in sync; focus moves on open | Full-screen zoom from the center, bounce |
| Toast | Slide 8 to 16 px from its edge + fade 200 ms; exits faster; pauses on hover | Toasts sliding across the screen |
| Skeleton | Slow shimmer (1.5 to 2 s) or static; disappears without a crossfade jump | Fast pulsing gray blocks |
| Number updates (KPI) | Value changes with a 150 ms fade or a short count-up only when the delta is meaningful | Count-up on every poll |
| Accordion | Height and opacity 200 to 300 ms; content readable before the end | Springy height |
| Drag and drop | Follows the pointer 1:1; drop settles with a short spring | Lag behind the pointer |

## Reduced motion policy

`prefers-reduced-motion: reduce` is a user requirement, not a theme:

- **Remove**: parallax, scroll-linked transforms, auto-playing motion, large translations, zooms, bounce, staggered reveals, count-ups, smooth scroll.
- **Replace** with instant state changes or a short opacity fade (≤ 150 ms): dialogs, menus, toasts, tab indicators.
- **Keep**: progress indicators and anything that conveys information motion-only, slowed or simplified; a loading spinner is fine, a pulsing skeleton can become static.
- Implement centrally: a media query in the token layer sets durations to near zero and disables non-essential keyframes; `gsap.matchMedia()` / `useReducedMotion()` for JavaScript engines; test by toggling the OS setting and in Playwright (`emulateMedia`).
- Offer an in-app toggle only when the product has motion beyond UI feedback (marketing, games, data stories).

## Motion tokens

Motion is part of the design system: `--duration-fast: 120ms`, `--duration-base: 200ms`, `--duration-slow: 320ms`, `--ease-out: cubic-bezier(0.2, 0, 0, 1)`, `--ease-in: cubic-bezier(0.4, 0, 1, 1)`, `--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)`, plus a spring preset for libraries that support one. Components reference tokens; the reduced-motion media query overrides them in one place. The same tokens feed Vue `<Transition>` classes, Motion variants and GSAP defaults so the product has one tempo.

## Scroll-driven and cinematic work

Scroll storytelling, pinned sections, parallax and 3D belong to pages whose job is to tell a story: launches, brand sites, reports designed as narratives. They do not belong in operational applications, where they cost attention and frames.

When the product is a story:
- Design the static page first; motion reveals the same content in the same order (`motion-scroll.md` checklist).
- Scroll-linked progress uses CSS scroll-driven animations when supported, otherwise GSAP ScrollTrigger (`gsap.md`); never a hand-rolled scroll listener.
- Pinned sections have fixed, tested heights per breakpoint; the footer is reachable; keyboard scrolling works.
- One brand moment above the fold, lazy-loaded engines below it; the LCP element is an image or text, not the animation.
- 3D only when the object is the content (product configurator, spatial data) and after `threejs.md` budgets are met.

## Performance

- Animate `transform` and `opacity` only; `height`, `width`, `top`, `left`, `margin`, `box-shadow` and `filter` trigger layout or expensive paints. Fake height animations with `transform: scaleY` + content fade, or `grid-template-rows: 0fr → 1fr` for accordions when the cost is acceptable.
- `will-change` is a hint applied right before an animation and removed after; permanent `will-change` on many elements consumes GPU memory and can blur text.
- Avoid layout thrash: read layout (`getBoundingClientRect`) in one batch, write in another; use FLIP for layout transitions instead of animating layout properties.
- Compositor layers: each animated element may become a layer; dozens of layers on a mobile GPU drop frames. Animate containers, not every child.
- Keep the main thread free during motion: no data processing, no synchronous storage, no large re-renders triggered by the animation.
- Images and video in motion: pre-sized, decoded (`decoding="async"`, `fetchpriority` for the hero), and not rescaled every frame.

## Measuring

- Frame time: Chrome Performance panel with 4× CPU throttling on a mid-range Android profile; target under 16.7 ms per frame during the animation, no long tasks.
- INP: interactions that start an animation must stay under 200 ms from input to next paint; defer non-visual work after the first frame (`performance.md`).
- Count layers and paints with the Rendering panel (paint flashing, layer borders).
- Memory: heap and GPU memory stable after repeated open/close cycles (`animation-lifecycle.md`).
- Perceived quality: watch a real user once; motion that needs explanation is too much.

## Review checklist

- [ ] Each animation passes the purpose test; frequent interactions have little or none
- [ ] Durations and easings come from motion tokens and the table above; nothing in product UI over 700 ms
- [ ] Exits faster than entries; origin-aware; staggers capped
- [ ] Reduced motion removes or replaces everything non-essential; verified with the OS setting
- [ ] Only `transform` and `opacity` animated; `will-change` transient
- [ ] No scroll hijacking, parallax or 3D in operational screens
- [ ] Frame time and INP measured on a throttled profile
- [ ] Everything created is cleaned up (`animation-lifecycle.md`)
