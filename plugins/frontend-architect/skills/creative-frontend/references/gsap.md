# GSAP

Verified: `gsap` 3.15 on npm; license field "Standard 'no charge' license". All plugins (ScrollTrigger, ScrollSmoother, SplitText, Flip, etc.) ship in the `gsap` package; register the ones you use.

## Contents
- Core rules
- Framework-agnostic module with context and matchMedia
- Vue / Nuxt integration
- React / Next.js integration
- ScrollTrigger rules
- Plugins worth knowing

## Core rules

- Prefer timelines for anything with more than one step; position parameters (`'<'`, `'-=0.2'`) instead of manual delays.
- Use `gsap.context()` (or `useGSAP` in React) so every tween and ScrollTrigger created inside can be reverted in one call on unmount.
- Use `gsap.matchMedia()` for breakpoints and reduced motion: animations created inside are reverted automatically when the query stops matching.
- Animate transforms (`x`, `y`, `scale`, `rotate`) and `autoAlpha`; avoid `top/left/width/height`.
- Register plugins once at module level: `gsap.registerPlugin(ScrollTrigger)`.

## Framework-agnostic module

```ts
// @verify creative:gsap/hero-timeline.ts
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/** Builds the hero animation inside `root` and returns a cleanup function. */
export function createHeroAnimation(root: HTMLElement): () => void {
  const ctx = gsap.context(() => {
    const mm = gsap.matchMedia()

    mm.add(
      { motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 768px)' },
      (context) => {
        const { motion, desktop } = context.conditions ?? {}
        if (!motion) return

        gsap
          .timeline({ defaults: { ease: 'power3.out', duration: 0.8 } })
          .from('[data-hero-title]', { y: 40, autoAlpha: 0 })
          .from('[data-hero-copy]', { y: 20, autoAlpha: 0 }, '-=0.5')
          .from('[data-hero-cta]', { scale: 0.95, autoAlpha: 0 }, '<0.2')

        if (desktop) {
          gsap.to('[data-hero-media]', {
            yPercent: -15,
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true },
          })
        }
      },
    )
  }, root)

  return () => ctx.revert()
}
```

## Vue / Nuxt

```ts
// @verify creative:vue/useGsapContext.ts
import { gsap } from 'gsap'
import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/** Runs `setup` inside a GSAP context scoped to `scope`, reverting everything on unmount. */
export function useGsapContext(scope: Ref<HTMLElement | null>, setup: () => void) {
  let ctx: gsap.Context | undefined
  onMounted(() => {
    if (scope.value) ctx = gsap.context(setup, scope.value)
  })
  onBeforeUnmount(() => ctx?.revert())
}
```

In Nuxt, animation code runs in `onMounted` (client only). Register plugins in a `.client.ts` plugin or inside the composable. Refresh ScrollTrigger after route changes and after images or fonts that change layout have loaded (`ScrollTrigger.refresh()`).

## React / Next.js

Use the official `@gsap/react` `useGSAP` hook: it wraps `gsap.context` and reverts on unmount.

```tsx
// @verify creative:react/RevealList.tsx
'use client'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useRef } from 'react'

gsap.registerPlugin(useGSAP, ScrollTrigger)

export function RevealList({ items }: { items: string[] }) {
  const container = useRef<HTMLUListElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('li', {
          y: 24,
          autoAlpha: 0,
          stagger: 0.08,
          scrollTrigger: { trigger: container.current, start: 'top 80%' },
        })
      })
    },
    { scope: container },
  )

  return (
    <ul ref={container}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
```

Event-handler animations created after mount must be wrapped with `contextSafe` from `useGSAP` so they are cleaned up too.

## ScrollTrigger rules

- Pinning changes layout: test with real content heights; call `ScrollTrigger.refresh()` after async content.
- `scrub` for scroll-linked progress; `toggleActions` for one-shot reveals.
- Do not animate the trigger element itself with transforms that change its position; animate children.
- With Lenis, connect the two (`motion-scroll.md`); with ScrollSmoother, do not add Lenis.
- `markers: true` only in development.

## Plugins worth knowing

Flip (layout transitions between states), SplitText (accessible text splitting; keep the original text available to assistive technology), MotionPath, DrawSVG, MorphSVG, Observer (normalized wheel/touch input), ScrollSmoother. Use the official GSAP skills or docs for exact options.
