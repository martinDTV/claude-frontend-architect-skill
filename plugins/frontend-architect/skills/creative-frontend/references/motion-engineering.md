# Motion engineering with GSAP: lifecycle, scroll, reduced motion, routes, verification

GSAP is optional. Reach for it when a design needs sequenced timelines, scroll-linked choreography, pinning, SVG drawing or precise control that CSS transitions, `<Transition>`, the View Transitions API or Motion cannot give; never for a hover state or a fade. This file holds the patterns that make GSAP safe in Vue/Nuxt and React/Next, the defects the audit scripts find, and the browser checks that prove the patterns. The code blocks are extracted into the verification projects and compiled, tested and served there (`@verify` markers).

## Contents

1. Facts the patterns rest on
2. Vue and Nuxt
3. React and Next.js
4. General patterns
5. What the detectors find
6. What the browser checks prove
7. External GSAP skills
8. Limits

## 1. Facts the patterns rest on

| Fact | Source |
|---|---|
| GSAP 3.15; `gsap.context()` (3.11+) collects every tween and ScrollTrigger created inside its function, scopes selector text to an element or ref, and `revert()` kills them and clears the context; a function returned from the context runs on revert | gsap.com, `gsap.context()` |
| `gsap.matchMedia()` (3.11+) creates a context per handler, re-runs the handler when a condition starts matching and reverts everything it created when it stops; conditions can be named (`reduce: "(prefers-reduced-motion: reduce)"`) and read through `context.conditions`; `mm.revert()` reverts all handlers; a MatchMedia already is a context, do not wrap it in another | gsap.com, `gsap.matchMedia()` |
| `useGSAP()` from `@gsap/react` (2.1) is a drop-in for `useEffect`/`useLayoutEffect` that creates a context, reverts it on unmount, accepts `scope`, `dependencies` and `revertOnUpdate` (default `false`), handles React Strict Mode's double effect, falls back to `useEffect` when `window` is undefined, needs `'use client'` in the App Router, and gives `contextSafe()` for handlers and delayed code | gsap.com, React resource |
| ScrollTrigger (3.3+): `scrollTrigger` property or `ScrollTrigger.create()`; start and end positions are computed at creation and on resize; `ScrollTrigger.refresh()` after layout changes; `trigger.kill()` unpins and removes listeners; `ScrollTrigger.getAll()`/`killAll()`; `pin` wraps the element in a pin-spacer; `ScrollTrigger.matchMedia()` is deprecated in favour of `gsap.matchMedia()` | gsap.com, ScrollTrigger |
| Licence: Standard "No Charge" GSAP License (Webflow), free for commercial use including every plugin since 2025; not an OSI licence; the one prohibited use is building no-code animation tools that compete with Webflow | gsap.com/licensing |
| Official skills: `greensock/gsap-skills` (MIT, prose only, eight skills) | GitHub, section 7 |

## 2. Vue and Nuxt

Rules: create after mount, inside a context or a MatchMedia scoped to the component's root; pass `root.value`, never the ref object, as the scope; revert in `onUnmounted` (route leave unmounts the page, so one revert covers navigation); render the animated component inside `<ClientOnly>` when the markup itself depends on the browser, and otherwise keep every GSAP call out of the top level of `<script setup>`; branch on `prefers-reduced-motion` with `gsap.matchMedia()` and give the reduce branch the final state; make the story skippable for keyboard users; refresh ScrollTrigger when content below the trigger loads late.

```vue
<!-- @verify nuxt:components/motion/ScrollStory.vue -->
<script setup lang="ts">
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Diagnostics the browser checks read (counts of live triggers and tweens): harmless in production, useful in tests.
type LiveChild = { kind: string, duration: number, paused: boolean, progress: number, vars: string[], targets: string[] }
type MotionDebug = { triggers: () => number, tweens: () => number, children: () => LiveChild[], reduced: boolean | null, mounts: number, reverts: number }
function debug(): MotionDebug {
  const w = window as unknown as { __motion?: MotionDebug }
  const live = () => gsap.globalTimeline.getChildren(true, true, true)
  // tweens() counts only tweens that animate DOM elements, which is what this component creates. ScrollTrigger keeps one
  // paused delayedCall of its own (its resize debounce) on the global timeline for the life of the page; it is not a leak.
  const domTweens = () => gsap.globalTimeline.getChildren(true, true, false).filter((t) => (t as gsap.core.Tween).targets().some((x: unknown) => x instanceof Element))
  w.__motion ??= {
    triggers: () => ScrollTrigger.getAll().length,
    tweens: () => domTweens().length,
    children: () => live().map((t) => ({ kind: 'targets' in t ? 'tween' : 'timeline', duration: t.duration(), paused: t.paused(), progress: t.progress(), vars: Object.keys(t.vars).slice(0, 8), targets: 'targets' in t ? (t as gsap.core.Tween).targets().map((x: unknown) => (x instanceof Element ? x.tagName.toLowerCase() : typeof x)) : [] })),
    reduced: null,
    mounts: 0,
    reverts: 0,
  }
  return w.__motion
}

const root = ref<HTMLElement | null>(null)
let mm: gsap.MatchMedia | undefined

onMounted(() => {
  gsap.registerPlugin(ScrollTrigger)
  const d = debug()
  d.mounts++
  // one MatchMedia per instance, scoped to this root: selector text below only matches descendants
  mm = gsap.matchMedia(root.value ?? undefined)
  mm.add({ reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' }, (context) => {
    const reduce = Boolean(context.conditions?.reduce)
    d.reduced = reduce
    if (reduce) {
      gsap.set('.story-step', { opacity: 1, y: 0 }) // final state, no motion, nothing to scrub
      return
    }
    // end at 'bottom bottom': the last step finishes when the section's bottom reaches the viewport bottom, a position
    // every page can scroll to; an end below that ('bottom 40%') is unreachable when little content follows
    gsap.timeline({ scrollTrigger: { trigger: root.value, start: 'top 85%', end: 'bottom bottom', scrub: 0.5 } }).from('.story-step', { y: 48, opacity: 0, stagger: 0.25 })
  })
})

onUnmounted(() => {
  // reverts every handler's tweens and ScrollTriggers (pins unwrapped, listeners removed); one call covers route changes
  mm?.revert()
  debug().reverts++
})
</script>

<template>
  <section ref="root" class="story" aria-labelledby="story-title">
    <h2 id="story-title">Three steps</h2>
    <a class="story-skip" href="#after-story">Skip the story</a>
    <p class="story-step">Step one: the problem, stated plainly.</p>
    <p class="story-step">Step two: what changes for the person using it.</p>
    <p class="story-step">Step three: the proof.</p>
  </section>
</template>

<style scoped>
.story { min-height: 140vh; padding: 2rem 1rem; }
.story-step { min-height: 30vh; max-width: 40rem; margin: 0 auto; }
.story-skip { display: inline-block; margin-bottom: 1rem; }
</style>
```

```vue
<!-- @verify nuxt:pages/motion.vue -->
<script setup lang="ts">
import ScrollStory from '~/components/motion/ScrollStory.vue'
useHead({ title: 'Motion' })
</script>

<template>
  <main id="main">
    <h1>Scroll story</h1>
    <p>The heading and this paragraph render on the server. The story below animates only in the browser; its server HTML is the fallback.</p>
    <ClientOnly>
      <ScrollStory />
      <template #fallback>
        <p class="story-fallback">The story loads in the browser.</p>
      </template>
    </ClientOnly>
    <section id="after-story" tabindex="-1">
      <h2>After the story</h2>
      <p>Content that follows keeps its place whatever the motion preference.</p>
      <NuxtLink to="/motion-second">Go to the second page</NuxtLink>
    </section>
  </main>
</template>
```

```vue
<!-- @verify nuxt:pages/motion-second.vue -->
<script setup lang="ts">
useHead({ title: 'Second page' })
</script>

<template>
  <main id="main">
    <h1>Second page</h1>
    <p>Navigating here unmounts the story: no ScrollTrigger, pin spacer or tween may survive.</p>
    <NuxtLink to="/motion">Back to the story</NuxtLink>
  </main>
</template>
```

Reuse: a composable that returns a `gsap.Context` created in `onMounted` and reverted in `onUnmounted` (`creative-frontend/references/gsap.md`, `useGsapContext`) keeps components free of cleanup code; a factory that builds a paused timeline from a root element (`useHeroTimeline(root)`) is fine because nothing runs at import time. What never works: a timeline exported from a module (shared by every instance, evaluated on the server), a tween at the top level of `<script setup>` (runs during SSR), `watchEffect` creating tweens (runs during setup on the server).

## 3. React and Next.js

Rules: `useGSAP(() => {…}, { scope: ref })` for everything created on mount; `dependencies` when the animation depends on props or state, with `revertOnUpdate: true` when the old animation must go; `contextSafe()` for handlers and anything delayed; a returned cleanup for what the context does not own (a MatchMedia you created, listeners); `'use client'` on the component file, never on the page that renders it; refs read inside the hook, never during render; one place per page that owns ScrollTriggers.

```tsx
// @verify next:features/motion/ScrollStory.tsx
'use client'
import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type LiveChild = { kind: string; duration: number; paused: boolean; progress: number; vars: string[]; targets: string[] }
type MotionDebug = { triggers: () => number; tweens: () => number; children: () => LiveChild[]; reduced: boolean | null; mounts: number; reverts: number }
function debug(): MotionDebug {
  const w = window as unknown as { __motion?: MotionDebug }
  const live = () => gsap.globalTimeline.getChildren(true, true, true)
  // tweens() counts only tweens that animate DOM elements, which is what this component creates. ScrollTrigger keeps one
  // paused delayedCall of its own (its resize debounce) on the global timeline for the life of the page; it is not a leak.
  const domTweens = () => gsap.globalTimeline.getChildren(true, true, false).filter((t) => (t as gsap.core.Tween).targets().some((x: unknown) => x instanceof Element))
  w.__motion ??= {
    triggers: () => ScrollTrigger.getAll().length,
    tweens: () => domTweens().length,
    children: () => live().map((t) => ({ kind: 'targets' in t ? 'tween' : 'timeline', duration: t.duration(), paused: t.paused(), progress: t.progress(), vars: Object.keys(t.vars).slice(0, 8), targets: 'targets' in t ? (t as gsap.core.Tween).targets().map((x: unknown) => (x instanceof Element ? x.tagName.toLowerCase() : typeof x)) : [] })),
    reduced: null,
    mounts: 0,
    reverts: 0,
  }
  return w.__motion
}

export function ScrollStory() {
  const root = useRef<HTMLElement>(null)
  useGSAP(
    () => {
      const d = debug()
      d.mounts++
      const mm = gsap.matchMedia(root)
      mm.add({ reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' }, (context) => {
        const reduce = Boolean(context.conditions?.reduce)
        d.reduced = reduce
        if (reduce) {
          gsap.set('.story-step', { opacity: 1, y: 0 })
          return
        }
        gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top 85%', end: 'bottom bottom', scrub: 0.5 } }).from('.story-step', { y: 48, opacity: 0, stagger: 0.25 })
      })
      // the hook reverts its own context on unmount; the MatchMedia we created is ours to revert
      return () => {
        mm.revert()
        debug().reverts++
      }
    },
    { scope: root },
  )
  return (
    <section ref={root} className="story" aria-labelledby="story-title" style={{ minHeight: '140vh', padding: '2rem 1rem' }}>
      <h2 id="story-title">Three steps</h2>
      <a className="story-skip" href="#after-story">Skip the story</a>
      <p className="story-step" style={{ minHeight: '30vh' }}>Step one: the problem, stated plainly.</p>
      <p className="story-step" style={{ minHeight: '30vh' }}>Step two: what changes for the person using it.</p>
      <p className="story-step" style={{ minHeight: '30vh' }}>Step three: the proof.</p>
    </section>
  )
}
```

```tsx
// @verify next:app/motion/page.tsx
import Link from 'next/link'
import { ScrollStory } from '@/features/motion/ScrollStory'

export const metadata = { title: 'Motion' }

// a Server Component: it renders the client component's markup on the server; GSAP runs only after hydration
export default function MotionPage() {
  return (
    <main id="main">
      <h1>Scroll story</h1>
      <p>The heading and this paragraph render on the server. The story below animates only in the browser.</p>
      <ScrollStory />
      <section id="after-story" tabIndex={-1}>
        <h2>After the story</h2>
        <p>Content that follows keeps its place whatever the motion preference.</p>
        <Link href="/motion/other">Go to the second page</Link>
      </section>
    </main>
  )
}
```

```tsx
// @verify next:app/motion/other/page.tsx
import Link from 'next/link'

export const metadata = { title: 'Second page' }

export default function OtherPage() {
  return (
    <main id="main">
      <h1>Second page</h1>
      <p>Navigating here unmounts the story: no ScrollTrigger, pin spacer or tween may survive.</p>
      <Link href="/motion">Back to the story</Link>
    </main>
  )
}
```

Strict Mode: in development React mounts, unmounts and mounts every component once more, so an effect that creates a tween without reverting it leaves two. `useGSAP` reverts between the two runs; a plain `useEffect` must return `() => ctx.revert()`. The model of that hazard, runnable without a browser:

```ts
// @verify creative:motion/context-cleanup.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import gsap from 'gsap'

// plain objects as targets: the same lifecycle rules, no DOM needed
const live = () => gsap.globalTimeline.getChildren(true, true, true).length
function mountStory(target: { x: number }) {
  return gsap.context(() => {
    gsap.to(target, { x: 100, duration: 10 })
    gsap.timeline().to(target, { x: 0, duration: 10 })
  })
}

afterEach(() => gsap.globalTimeline.clear())

describe('gsap.context cleanup', () => {
  it('revert() removes every tween and timeline the context created', () => {
    const target = { x: 0 }
    const before = live()
    const ctx = mountStory(target)
    expect(live()).toBeGreaterThan(before)
    ctx.revert()
    expect(live()).toBe(before)
  })

  it('mounting twice without a revert duplicates the animations (the Strict Mode and remount hazard); reverting between mounts does not', () => {
    const target = { x: 0 }
    const before = live()
    const first = mountStory(target)
    const perMount = live() - before
    mountStory(target) // the leak: a second mount while the first is alive
    expect(live()).toBe(before + 2 * perMount)
    gsap.globalTimeline.clear()
    const again = mountStory(target)
    again.revert()
    mountStory(target) // the fix: revert before the next mount
    expect(live()).toBe(before + perMount)
    first.revert()
  })
})
```

## 4. General patterns

- **Sequential timelines**: one `gsap.timeline()` per scene with position parameters (`'<'`, `'-=0.2'`, labels) instead of nested `delay`s; `defaults` on the timeline for shared ease and duration; keep the timeline paused and `play()` it from an event or a ScrollTrigger so the same timeline serves hover, click and scroll.
- **Stagger**: `stagger: { each, from: 'start' | 'center' | 'edges', grid }` on one tween over a list, never a tween per item; cap the total (`each * count`) under the reading time of the content.
- **Scroll storytelling**: one timeline per section with `scrollTrigger: { trigger, start, end, scrub }`; `pin` only on the section's own wrapper, never on an element that is animated; create triggers in document order; call `ScrollTrigger.refresh()` after images or async content change the layout; `invalidateOnRefresh: true` when values depend on the viewport.
- **SVG**: animate `attr` (`attr: { d, r, cx }`) and stroke offsets with `strokeDashoffset` and `strokeDasharray` set from `getTotalLength()` after mount; `transformOrigin` on groups; DrawSVG and MorphSVG are free plugins now and need `gsap.registerPlugin`; keep text as text and decorative SVG `aria-hidden`.
- **Page transitions**: the View Transitions API first (`document.startViewTransition`, Nuxt `experimental.viewTransition`, Next `ViewTransition`), GSAP for transitions inside the page; whatever runs on route change must finish or be killed before the next route mounts, which is why ScrollTriggers belong to the page component that `onUnmounted`/`useGSAP` tears down.
- **State-driven animation**: react to state in `watch`/`useEffect` with a tween that targets the final value (`gsap.to(el, { height: open ? 'auto' : 0 })`), `overwrite: 'auto'` so a quick toggle does not stack tweens, and `contextSafe` or the context's `add()` so the tween belongs to the component.
- **Performance**: transform and opacity only in loops; `will-change` set by GSAP's `force3D`, not permanently in CSS; one ticker (`gsap.ticker.add`) for continuous effects instead of `requestAnimationFrame` per component; `lazy: true` default; measure INP and long tasks on a mid-range phone before adding a scroll effect; no `content-visibility: auto` on scroll-triggered sections (measurements break).
- **Progressive degradation**: the final state must be correct with no JavaScript (`from` tweens hide nothing before mount if the initial CSS is the final state and the tween animates from a different one), under `prefers-reduced-motion` (section 2 and 3), and when GSAP fails to load; the story is skippable; nothing essential lives only in motion.

The reduced-motion choice outside GSAP, for CSS and View Transitions, reads the same media query with a safe default:

```ts
// @verify creative:motion/reduced-motion.ts
export type MotionPreference = 'reduce' | 'no-preference'

type MatchMedia = (query: string) => { matches: boolean }

/** Reads prefers-reduced-motion. Without matchMedia (server, old browser) it answers reduce: the safe default. */
export function motionPreference(matchMedia: MatchMedia | undefined = typeof window === 'undefined' ? undefined : window.matchMedia?.bind(window)): MotionPreference {
  if (!matchMedia) return 'reduce'
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference'
}
```

```ts
// @verify creative:motion/reduced-motion.test.ts
import { describe, expect, it } from 'vitest'
import { motionPreference } from './reduced-motion'

describe('motionPreference', () => {
  it('answers reduce without matchMedia (server rendering)', () => {
    expect(motionPreference(undefined)).toBe('reduce')
  })
  it('follows the media query when it exists', () => {
    expect(motionPreference((q) => ({ matches: q.includes('reduce') }))).toBe('reduce')
    expect(motionPreference(() => ({ matches: false }))).toBe('no-preference')
  })
})
```

## 5. What the detectors find

`leak-patterns.mjs` (the `frontend-architect` skill's scripts) reads every GSAP call with its AST context when the semantic engine runs; the lexical engine keeps the 1.3 pair count (`leak-gsap`, heuristic).

| Finding | Condition | Level |
|---|---|---|
| `gsap-module-scope-animation` | `gsap.to/from/fromTo/set/timeline` or `ScrollTrigger.create` at module scope | confirmed (high with SSR) |
| `gsap-outside-client-lifecycle` | the same at the top level of `<script setup>` (confirmed with SSR on) or in a React render body (heuristic); `import.meta.client` guards and `.client.vue` files are exempt | confirmed / heuristic |
| `gsap-effect-without-cleanup` | created inside `useEffect`/`useLayoutEffect` whose callback returns no cleanup; the message says when a missing dependency array also recreates it on every render | confirmed |
| `scrolltrigger-without-cleanup` | ScrollTriggers (`ScrollTrigger.create` or the `scrollTrigger` option) in a file with no `revert()`, `kill()`, `killAll` or `useGSAP`; heuristic when a context or MatchMedia exists but nothing reverts it | confirmed / heuristic |
| `motion-without-reduced-motion` | scroll-driven, pinned or infinite (`repeat: -1`) motion with no `gsap.matchMedia`, media query or reduced-motion composable in the file | heuristic |

Not reported: tweens in event handlers and factories (the context decides later), `gsap.set` of a final state under a client guard, anything in a `.client.vue` file. Fixtures with the truth written first: `verification/tools/fixtures/motion-nuxt`, `motion-next` (precision and recall 100% on both; the lexical engine stays silent).

## 6. What the browser checks prove

`verification/nuxt/check-motion.mjs` and `verification/next/check-motion.mjs` serve the built apps and drive Chromium through the pinned Playwright: the story page renders its server HTML (fallback or static markup) with no console error and no hydration warning; after hydration the diagnostics report at least one ScrollTrigger and live tweens on DOM elements; client-side navigation to the second route leaves zero ScrollTriggers, zero pin spacers and zero tweens on DOM elements (the diagnostics count tweens whose targets are elements: ScrollTrigger keeps one paused `delayedCall` of its own, its resize debounce, on the global timeline for the life of the page, and a check that counted it would fail on code that leaks nothing); coming back mounts once more and the counts equal the first visit (no duplicates, `mounts` and `reverts` consistent); with `prefers-reduced-motion: reduce` the reduce branch runs, the steps are visible at once and no scrubbed trigger exists; Tab reaches the primary navigation and the skip link before the story; at 375 px there is no horizontal overflow and the triggers survive the resize. Screenshots are not evidence here: every assertion reads DOM or GSAP state.

## 7. External GSAP skills

`greensock/gsap-skills` is the official repository of the GSAP team: MIT, eight prose-only skills (`gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-plugins`, `gsap-utils`, `gsap-react`, `gsap-performance`, `gsap-frameworks`), no `allowed-tools`, no scripts; installable with the skills CLI into `~/.claude/skills` or as a Claude Code marketplace. Through the capability registry (`frontend-architect/assets/capabilities.json`) they collaborate on `motion-design` only when the task names GSAP or ScrollTrigger or the project already depends on `gsap`, one or two skills chosen by sub-capability (scroll, timeline, React, Vue/Svelte, performance, plugins), with this skill as the owner of lifecycle, reduced motion, cleanup and budgets. Their advice to "recommend GSAP when no library was chosen" does not apply here: GSAP is a choice this skill makes on evidence, not a default.

## 8. Limits

The detectors read one file at a time: a cleanup that lives in a parent or a composable is not credited (heuristic, verify by reading). Strict Mode's double effect is modelled with plain-object contexts, not with React DOM; the browser checks run production builds where Strict Mode is off. `ScrollTrigger.refresh()` after late content is a rule here and a thing to verify by eye on real pages. Lenis and smooth scrolling are in `motion-scroll.md`; Three.js and WebGL stay outside this increment.
