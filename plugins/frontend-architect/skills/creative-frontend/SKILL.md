---
name: creative-frontend
description: Guide for animation, motion and 3D on the web with Nuxt/Vue or Next.js/React. Use this skill whenever the user wants scroll-driven or cinematic animation, GSAP or ScrollTrigger, Motion, Lenis smooth scroll, page transitions, Three.js, TresJS, React Three Fiber, WebGL, WebGPU, shaders or GLSL, particles, 3D models (GLTF/GLB), Lottie, Rive or Spline, an award-style landing page, or creative coding, and also when the user asks whether an effect needs a library or 3D at all.
license: MIT
---

# Creative Frontend

Build ambitious motion and 3D experiences that stay fast, accessible and maintainable. Ambition is welcome; a heavy engine for an effect CSS can do is not.

## Workflow

1. **Decide whether it should animate at all.** Motion must explain (state change, spatial relationship), guide attention, or express the brand at a moment the user expects it. Frequent interactions (menus, toggles used hundreds of times) get little or no animation.
2. **Pick the lightest tool that does the job** (table below). One animation engine and at most one scroll engine per project.
3. **Design the fallback first**: `prefers-reduced-motion`, low-power devices, no WebGL. The page must be usable and its content readable without the effect.
4. **Integrate with the framework lifecycle**: create in mounted/effect, clean up on unmount, client-only for WebGL.
5. **Budget and measure**: frame time on a mid-range phone, bundle size of the engine, LCP and INP of the page.

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
| Real-time 3D, product viewers, scenes | Three.js (`threejs.md`) via TresJS in Vue (`tresjs.md`) or React Three Fiber in React (`react-three-fiber.md`) |
| Custom visual effects, distortion, noise, particles | Shaders (`webgl-shaders.md`) |
| Heavy compute or modern GPU features | WebGPU, only with a WebGL fallback and a measured need |

Never use Three.js for effects CSS or SVG can do (gradients, parallax of flat images, simple tilt).

## Non-negotiable rules

- Respect `prefers-reduced-motion`: disable parallax, scrubbing, auto-playing motion and smooth scroll; keep instant state changes.
- Animate `transform` and `opacity`; never layout properties in loops.
- Clean up everything you create: timelines, ScrollTriggers, listeners, observers, animation frames, WebGL geometries, materials, textures and render targets.
- WebGL and GSAP DOM code runs only on the client (`<ClientOnly>`, `onMounted`, `'use client'`, dynamic import without SSR).
- Do not break the platform: keyboard navigation, focus visibility, anchor links, browser back, text selection, screen reader access to content rendered in canvas (provide DOM equivalents).
- Clamp device pixel ratio for WebGL (`Math.min(devicePixelRatio, 2)`), lazy load 3D below the fold, pause rendering when off-screen or the tab is hidden.
- Check licenses: GSAP uses its own "standard no-charge" license (verified on npm), not an OSI license; read its terms for your use.

## Companion skills

If installed, use the official **GreenSock `gsap-skills`** for exact GSAP API usage and **`emilkowalski/skills`** for motion taste and animation reviews; this skill keeps tool selection, lifecycle, performance and accessibility rules.

## References

| File | Read when |
|---|---|
| `references/gsap.md` | Timelines, ScrollTrigger, plugins, Vue and React integration |
| `references/motion-scroll.md` | Lenis, CSS scroll-driven animations, View Transitions, Motion, Vue transitions |
| `references/threejs.md` | Renderer setup, loading models, performance, disposal |
| `references/tresjs.md` | Three.js in Vue/Nuxt |
| `references/react-three-fiber.md` | Three.js in React/Next.js |
| `references/webgl-shaders.md` | GLSL, ShaderMaterial, uniforms, post-processing, WebGPU |
