---
name: creative-frontend
description: Visual design, motion and 3D guide for Nuxt/Vue and Next.js/React frontends. Use it whenever the user asks how an interface should look or feel: art direction, typography, color, spacing, layout and responsive design, dashboards and dense enterprise screens, a design critique or redesign, "make it look professional" or "less generic", dark mode decisions; and whenever the user wants animation, microinteractions, page transitions, scroll-driven or cinematic motion, GSAP or ScrollTrigger, Motion, Lenis, Three.js, TresJS, React Three Fiber, WebGL, WebGPU, shaders, particles, 3D models, Lottie, Rive or Spline, an award-style landing page, or asks whether an effect, an animation or 3D is needed at all.
license: MIT
---

# Creative Frontend

Decide how a product looks and moves so the result fits the product, the user and the context, and stays fast, accessible and maintainable. Ambition is welcome; decoration without purpose, a heavy engine for an effect CSS can do, or a marketing aesthetic on an operational tool are not. This skill owns visual judgment, motion and 3D; structure, token architecture, component libraries, accessibility rules and performance budgets live in the `frontend-architect` skill (`design-systems.md`, `component-libraries.md`, `accessibility.md`, `performance.md`).

## Visual design workflow

Read `references/visual-design.md` for the criteria; the order of decisions is:

1. **Direction statement** (three lines): product, audience, context → how it should feel and what it must never do. Enterprise tool, marketing page and consumer app get different statements; write it down before any component.
2. **Hierarchy**: the focal point and the one primary action per view; what the user came for sits above the fold.
3. **Type, spacing and color as tokens**: one UI family (system fonts are legitimate for enterprise), a modular scale, a 4/8 px spacing scale, role-based colors with one accent ramp; contrast checked. Tokens go into the project's design system (`design-systems.md`).
4. **Layout**: grid, breakpoints by content, density mode, mobile and tablet behavior, internationalization room (`references/layout-and-responsive.md`). When a local build can be served, verify it at mobile, tablet and desktop and at 125% text size with the `frontend-architect` skill's browser audit (responsive and visual checks, opt-in; its `ui-verification.md` reference explains what it proves and what still needs eyes).
5. **States and patterns**: loading, empty, error, partial and success for every data region; dashboards, forms, tables and navigation follow `references/enterprise-ui-patterns.md`.
6. **Motion last**, and only what passes the purpose test (`references/motion-design.md`).

Critique or redesign tasks start by naming what is generic or inconsistent against the checklist in `visual-design.md`, then fix hierarchy and tokens before touching decoration.

## Aesthetic must match product, user and context

- An operational product (ERP, clinical, back office, SaaS console) is quiet and dense: the data is the interface, color signals status and the primary action, motion is state feedback only.
- A marketing or editorial page may be expressive: one strong layout decision, a deliberate type pairing, one brand moment above the fold.
- Consumer apps sit in between; the direction statement decides.
- No gradients, glassmorphism, glows, 3D, parallax or scroll animation by default anywhere. Each needs a reason tied to meaning or brand at a moment the user expects it.
- Dark mode only when the product needs it; if two palettes cannot be maintained, ship one.
- Generic output is the sum of defaults (centered hero, three identical cards, purple gradient, emoji icons, vague copy). Use the named alternatives in `visual-design.md`.

## Motion workflow

1. **Decide whether it should animate at all.** Motion must explain (state change, spatial relationship), guide attention, or express the brand at a moment the user expects it. Frequent interactions (menus, toggles used hundreds of times) get little or no animation.
2. **Pick the lightest tool that does the job** (table below). One animation engine and at most one scroll engine per project.
3. **Design the fallback first**: `prefers-reduced-motion`, low-power devices, no WebGL. The page must be usable and its content readable without the effect.
4. **Integrate with the framework lifecycle**: create in mounted/effect, clean up on unmount, client-only for WebGL (`references/animation-lifecycle.md`).
5. **Budget and measure**: frame time on a mid-range phone, bundle size of the engine, LCP and INP of the page. For 3D experiences, score the result with `creative-quality-rubric.md` (what the checks verify, what needs eyes) before calling it done.

## Choosing the tool

| Effect | Lightest correct tool |
|---|---|
| Hover, focus, simple enter/leave | CSS transitions; Vue `<Transition>`; Motion for React |
| Route/page transitions | View Transitions API (with fallback), Nuxt/Vue transitions, Motion |
| Scroll-linked progress, reveal on scroll | CSS scroll-driven animations (check browser support), then GSAP ScrollTrigger |
| Complex sequenced timelines, pinning, scrubbing, SVG morphing, text splitting | GSAP (`gsap.md`) |
| Smooth scroll | Native first; Lenis only when the design needs it (`motion-scroll.md`) |
| Designer-made vector animations | Lottie (After Effects) or Rive (interactive, state machines) |
| No-code 3D scene from a designer | Spline (check runtime weight) |
| Real-time 3D, product viewers, scenes | Three.js (`threejs.md`) via TresJS in Vue (`tresjs.md`) or React Three Fiber in React (`react-three-fiber.md`); for an experience with a time architecture, ownership, cameras, post-processing and quality tiers, `immersive-3d-architecture.md` and the references it lists |
| Cinematic cameras, shot sequences, scroll-driven 3D stories, GLTF clips | `cinematic-motion.md` (rig, paths, sequences, cues, clip player, scene transitions) |
| Custom visual effects, distortion, noise, dissolve, holograms, refraction | Shaders (`webgl-shaders.md` for the minimal pattern, `shader-engineering.md` for the GLSL and TSL libraries and the post-processing pipeline) |
| Thousands to hundreds of thousands of particles, dispersion and reconstruction | `gpu-particles.md` (instanced field, GPGPU simulation, CPU baseline, adaptive density) |
| Studio look: environments without assets, tone mapping, physical materials, shadows, quality tiers | `rendering-quality.md` |
| Picking, configurators, chapter navigation, camera controls that share the camera | `interactive-3d.md` |
| Heavy compute or modern GPU features | WebGPU through `WebGPURenderer` + TSL, only with the WebGL 2 backend as fallback and a measured need (`shader-engineering.md` section 1) |

Never use Three.js for effects CSS or SVG can do (gradients, parallax of flat images, simple tilt). Durations, easings and the microinteraction catalog are in `motion-design.md`.

## Non-negotiable rules

- Respect `prefers-reduced-motion`: disable parallax, scrubbing, auto-playing motion and smooth scroll; keep instant state changes.
- Animate `transform` and `opacity`; never layout properties in loops.
- Clean up everything you create: timelines, ScrollTriggers, listeners, observers, animation frames, WebGL geometries, materials, textures and render targets. Add the disposal tests from `animation-lifecycle.md` to anything that owns GPU resources.
- WebGL and GSAP DOM code runs only on the client (`<ClientOnly>`, `onMounted`, `'use client'`, dynamic import without SSR).
- Do not break the platform: keyboard navigation, focus visibility, anchor links, browser back, text selection, screen reader access to content rendered in canvas (provide DOM equivalents).
- Clamp device pixel ratio for WebGL (`Math.min(devicePixelRatio, 2)`), lazy load 3D below the fold, pause rendering when off-screen or the tab is hidden.
- Text contrast 4.5:1 and UI contrast 3:1 hold in every visual direction, including dark mode and tenant themes; meaning is never conveyed by color alone (`accessibility.md`).
- Check licenses: GSAP uses its own "standard no-charge" license (verified on npm), not an OSI license; read its terms for your use.

## Companion skills

If installed, use the official **GreenSock `gsap-skills`** for exact GSAP API usage and **`emilkowalski/skills`** for motion taste and animation reviews. Design collaborators (`frontend-design`, `impeccable`, `ui-ux-pro-max`) are selected through the `frontend-architect` skill's capability protocol (`capabilities.md` there): only when the plan finds one available and the session lists it, for visual direction, critique or polish, never for motion, 3D, accessibility or browser evidence. Their output is a suggestion; this skill's rules, the user's instructions and the project's conventions decide, and nothing counts as executed without its Skill tool result. This skill keeps the decision criteria, lifecycle, performance and accessibility rules; when a companion conflicts with the installed version's official docs, the docs win.

## References

| File | Read when |
|---|---|
| `references/visual-design.md` | Deciding or reviewing how a product looks: direction, composition, hierarchy, typography, spacing, color, identity, avoiding generic UI |
| `references/layout-and-responsive.md` | Grids, breakpoints, density modes, mobile and tablet patterns, print, visual internationalization, zoom and reflow, viewport testing |
| `references/enterprise-ui-patterns.md` | Dashboards, complex forms, high-volume tables, navigation for many modules, states, notifications, information density |
| `references/motion-design.md` | Whether and how something should move: purpose test, durations, easings, choreography, microinteractions, reduced motion, motion tokens |
| `references/animation-lifecycle.md` | Creating and disposing animation and 3D resources, KeepAlive and SSR pitfalls, feature detection, GPU budgets, leak detection and the tested cleanup helpers |
| `references/gsap.md` | Timelines, ScrollTrigger, plugins, Vue and React integration |
| `references/motion-engineering.md` | Shipping GSAP or ScrollTrigger in Vue/Nuxt or React/Next: lifecycle and cleanup patterns per framework, reduced motion, route changes, SSR safety, SVG, page transitions, the leak-patterns motion rules and the browser checks that prove the examples; the official GSAP skills and when they collaborate |
| `references/motion-scroll.md` | Lenis, CSS scroll-driven animations, View Transitions, Motion, Vue transitions |
| `references/threejs.md` | Renderer setup, loading models, performance, disposal |
| `references/tresjs.md` | Three.js in Vue/Nuxt |
| `references/react-three-fiber.md` | Three.js in React/Next.js |
| `references/webgl-shaders.md` | GLSL, ShaderMaterial, uniforms, post-processing, WebGPU (the minimal pattern) |
| `references/immersive-3d-architecture.md` | Building an ambitious 3D experience: the technical contract (what is stable, what is not, what was verified), one clock and ordered update phases, property ownership, resource ownership and registry, the scene runtime (resize, pause, context loss, disposal), driving GSAP from the loop, framework integration rules |
| `references/cinematic-motion.md` | Camera rig and shot vocabulary (dolly, orbit, tracking), arc-length paths, shot sequences on scroll or time, cue sheets for HTML/lights/uniforms, the clip player for GLTF skeletal and morph animation, frame-rate independent damping, scene transitions, GSAP + Three.js coordination |
| `references/shader-engineering.md` | GLSL vs TSL contract, uniforms that never allocate, noise/lighting/transition chunks, dissolve, holographic, iridescent, refraction, image transition and displaced materials, the post-processing pipeline with quality tiers, TSL node materials for WebGPURenderer, visual direction |
| `references/gpu-particles.md` | What GPU-driven means, formations (sphere, ring, grid, mesh surface), the instanced field, the GPGPU simulation with forces and a pointer, the CPU baseline and the measured comparison, adaptive density, fallbacks |
| `references/rendering-quality.md` | Environments without assets, colour management and tone mapping, physical material presets, shadows and reflections, quality tiers and device budgets, progressive quality, visual coherence |
| `references/interactive-3d.md` | Accessibility contract, pointer in world space, raycast and GPU picking, controls that share the camera with the rig, chapter navigator (scroll, keys, buttons, hash), configurators as state machines, the physics seam |
| `references/immersive-experiences.md` | The three reference experiences (cinematic product, GPU particles, immersive story), how they are mounted in Nuxt and Next, and what the browser checks prove about them |
| `references/creative-quality-rubric.md` | Scoring an experience: eleven criteria, what is verified automatically and what needs a human, anti-patterns that cap the score, the review procedure |
