# Motion and scroll

## Contents
- Native first
- Lenis
- CSS scroll-driven animations
- View Transitions
- Motion (React) and Vue transitions
- Scroll storytelling checklist

## Native first

- CSS transitions and `@keyframes` cover most UI motion. Use `prefers-reduced-motion` media queries.
- `scroll-behavior: smooth` and `scroll-margin-top` for anchor navigation.
- Only one smooth-scroll implementation per site. Smooth scroll hijacking frustrates users when it fights native momentum; use it for experiential pages, not for apps and long reading.

## Lenis

Verified: package is `lenis` (1.3.x); `@studio-freight/lenis` is deprecated.

```ts
// @verify creative:scroll/lenis-gsap.ts
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

/** Smooth scroll synced with ScrollTrigger; disabled for reduced motion. Returns cleanup. */
export function startSmoothScroll(): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  const lenis = new Lenis({ autoRaf: false })
  lenis.on('scroll', ScrollTrigger.update)

  const tick = (time: number) => lenis.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  return () => {
    gsap.ticker.remove(tick)
    lenis.destroy()
  }
}
```

Call it once in a client-only plugin (Nuxt) or a top-level client component effect (Next.js), and run the cleanup on unmount. Keep anchors working (`lenis.scrollTo` for in-page links) and test keyboard scrolling (Space, Page Down, arrow keys).

## CSS scroll-driven animations

`animation-timeline: scroll()` / `view()` run off the main thread with no JavaScript. Use them for progress bars, reveals and simple parallax when browser support for your audience is sufficient; provide a static fallback with `@supports (animation-timeline: view())`.

## View Transitions

The View Transitions API animates between DOM states and, for same-origin navigations, between pages. Nuxt and Next.js have experimental or built-in integrations depending on version; check the installed version's docs. Always provide the non-animated path and respect reduced motion (`::view-transition-group(*) { animation: none }` under the media query).

## Motion (React) and Vue transitions

- React: `motion` (verified 14.x; `framer-motion` is published in sync) for declarative enter/exit, layout animations and gestures. Use `useReducedMotion()`.
- Vue: `<Transition>` and `<TransitionGroup>` with CSS classes for enter/leave and list moves; GSAP via JavaScript hooks for complex sequences.

## Scroll storytelling checklist

- [ ] Content readable and in order with JavaScript disabled or reduced motion
- [ ] Pinned sections have sensible heights on mobile and landscape
- [ ] No scroll-jacking that prevents reaching the footer or using keyboard
- [ ] Media lazy-loaded; first section paints fast (LCP not blocked by the animation engine)
- [ ] Animation engines loaded only on the pages that use them
