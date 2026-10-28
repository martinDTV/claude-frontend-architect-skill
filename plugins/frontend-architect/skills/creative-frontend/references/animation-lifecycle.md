# Animation and 3D lifecycle

Everything an animation or a scene creates must be released when the component goes away, the route changes, the user logs out or the tab is hidden. GPU memory is not garbage-collected, listeners keep components alive, and timers keep running on unmounted DOM. This file gives the lifecycle rules per engine, the detection procedure and executable tests. Motion decisions are in `motion-design.md`; engine specifics in `gsap.md`, `threejs.md`, `tresjs.md`, `react-three-fiber.md`, `motion-scroll.md`.

## Contents
- Create late, dispose early
- Per engine
- KeepAlive, transitions and Suspense pitfalls
- SSR safety
- Progressive enhancement and feature detection
- GPU and memory budgets
- A cleanup stack (tested)
- Testing disposal (tested)
- Testing GSAP cleanup
- Leak detection procedure

## Create late, dispose early

| Framework | Create in | Dispose in |
|---|---|---|
| Vue / Nuxt | `onMounted` (DOM exists, client only) | `onBeforeUnmount` (DOM still present) or `onScopeDispose` in composables |
| React / Next.js | `useEffect` (or `useGSAP`) | the effect's returned function |
| Plain modules | a factory that returns a `dispose()`/cleanup function | the caller's lifecycle |

Rules:
- Every factory returns its cleanup; a function that creates a tween, a renderer or a listener and returns nothing is a leak by design.
- Keep one owner per resource: the component that creates it disposes it; children never dispose a parent's renderer.
- Cleanups are idempotent and tolerate partial initialization (dispose may run before an async load finishes: cancel the load, dispose what exists).
- Async creation (model loading, dynamic import of an engine) checks a `disposed` flag before touching the scene when it resolves.

## Per engine

| Engine | Create | Must dispose |
|---|---|---|
| CSS transitions / `<Transition>` | Nothing to manage | Nothing; but `transitionend` listeners added manually must be removed |
| GSAP | `gsap.context(cb, scope)` or `useGSAP` (React); `gsap.matchMedia()` for breakpoints and reduced motion | `ctx.revert()` (kills tweens, timelines and ScrollTriggers created inside, restores inline styles); event-handler tweens created later go through `contextSafe`; `ScrollTrigger.refresh()` after layout changes, never in a loop |
| ScrollTrigger outside a context | `ScrollTrigger.create` | `trigger.kill()`; pinned elements leave pin spacers behind if not killed |
| Lenis | `new Lenis()` once per page, client only | `lenis.destroy()` and remove the ticker callback (`gsap.ticker.remove`) |
| Motion (React) | Declarative | Nothing, except `animate()` controls created imperatively (`controls.stop()`) |
| Three.js (imperative) | Renderer, scene, loaders in `onMounted`/effect | `renderer.setAnimationLoop(null)`, dispose geometries, materials, textures, render targets, `renderer.dispose()`, `renderer.forceContextLoss()` when many canvases are created over time; `disposeObject(scene)` from `threejs.md`; abort pending loaders; disconnect `ResizeObserver`; remove `visibilitychange` |
| TresJS | Declarative scene; `useLoop` | TresJS disposes what it created when `<TresCanvas>` unmounts; objects you create imperatively (textures from `TextureLoader`, custom materials, render targets) are yours to dispose |
| React Three Fiber | Declarative; `useFrame` | R3F disposes declared objects on unmount (unless `dispose={null}`); imperative objects and drei resources you create manually are yours; `useGLTF.preload` caches intentionally |
| Shaders / post-processing | `ShaderMaterial`, `EffectComposer`, render targets | dispose materials, passes and every render target; half-size targets still hold memory |
| Lottie / Rive | Player instances | `destroy()`/`cleanup()` per the library; stop on hidden tab |
| Browser APIs | `addEventListener`, `setInterval`, `requestAnimationFrame`, `ResizeObserver`, `IntersectionObserver`, `matchMedia` listeners | remove / clear / cancel / disconnect; prefer VueUse composables (`useEventListener`, `useRafFn`, `useResizeObserver`) which dispose with the scope |

## KeepAlive, transitions and Suspense pitfalls

- `<KeepAlive>` (Vue) keeps the component alive: `onBeforeUnmount` does not run on navigation. Pause in `onDeactivated` (stop the render loop, kill ScrollTriggers) and resume in `onActivated`; dispose only on real unmount.
- Route transitions with `mode: 'out-in'` keep two pages briefly alive: do not assume a single canvas or Lenis instance exists; create per page or share one in a layout-level composable.
- React Strict Mode mounts effects twice in development: a cleanup that is not idempotent, or a creation that is not repeatable, surfaces here. That is the point; fix the effect rather than disabling Strict Mode.
- Suspense boundaries (TresJS/R3F loaders) may unmount a subtree before its async load settles: check the `disposed` flag when the load resolves.
- Nuxt page transitions and `<NuxtPage>` keyed by route remount components on param changes; ScrollTrigger positions must be recalculated (`ScrollTrigger.refresh()` after the new page is laid out, typically in `nextTick` after `onMounted`).

## SSR safety

- WebGL, GSAP DOM plugins and Lenis exist only in the browser: `<ClientOnly>` / `.client.vue` / `onMounted` in Nuxt; `'use client'` plus `next/dynamic` with `ssr: false` in Next.js.
- Server-rendered markup must contain the real content (text, poster image) so SEO, reduced-motion users and failed-WebGL devices get the page; the canvas enhances it.
- Never import an engine at module scope of a server-rendered module if it touches `window` on import; dynamic import inside the mount hook.
- No `Math.random()`/`Date.now()` in the initial render for particle seeds: hydration mismatch. Seed on the client after mount.

## Progressive enhancement and feature detection

Check before creating, and design what happens when the check fails:

| Capability | Check | Fallback |
|---|---|---|
| WebGL / WebGL2 | `canvas.getContext('webgl2')` returns a context; also handle `webglcontextlost` | Poster image or CSS version |
| WebGPU | `navigator.gpu` and adapter request succeed | WebGL renderer |
| Reduced motion | `matchMedia('(prefers-reduced-motion: reduce)')` and react to changes | Static scene or a single frame; no autoplay |
| Reduced data | `prefers-reduced-data` where supported, `navigator.connection.saveData` | Do not download models/videos; poster only |
| Low power / weak GPU | Measure: render 30 frames, if the average frame time exceeds budget, lower DPR, disable post-processing, reduce particle count (drei `PerformanceMonitor`/`AdaptiveDpr` in R3F) | Quality tiers |
| Visibility | `document.hidden`, `IntersectionObserver` on the canvas | Pause the loop off-screen and in background tabs |
| Memory pressure | `performance.memory` (Chrome only) is a hint; context loss events are the real signal | Recreate at lower quality after context loss |

## GPU and memory budgets

- Textures: power-of-two where mipmaps are needed, sized for the display (a 2048² RGBA texture is 16 MB before mipmaps; four of them exceed many mobile budgets); KTX2/Basis compressed textures stay compressed on the GPU.
- Geometry: merged static meshes, `InstancedMesh` for repeats; draw calls in the low hundreds on mobile (`renderer.info.render.calls`).
- Device pixel ratio clamped to 2 (1.5 on mobile when frame time demands it).
- Render targets at half or quarter resolution for post effects; dispose them on resize before creating new ones.
- Animation: one `requestAnimationFrame` loop per page (GSAP ticker or the engine's loop), not one per component.
- Memory stable across N open/close cycles of the component (the test below); `renderer.info.memory.geometries` and `.textures` return to baseline after disposal.

## A cleanup stack (tested)

A small helper that collects cleanups and runs them once, newest first, with errors isolated. It replaces ad-hoc arrays of listeners and "did I remove that?" bugs, and it is the shape `gsap.context().revert()` has internally.

```ts
// @verify creative:lifecycle/cleanup-stack.ts
/**
 * Collects the cleanups of everything an animation or 3D scene creates and runs them once,
 * in reverse order, isolating errors so one failing dispose does not leak the rest.
 * Framework-agnostic: call `stack.dispose()` from onBeforeUnmount, a React effect cleanup or
 * a GSAP context revert.
 */
export interface CleanupStack {
  /** Registers a cleanup and returns it, so `add(() => …)` can be used inline. */
  add<T extends () => void>(cleanup: T): T
  /** Registers `target.dispose()` and returns the target (geometries, materials, textures, renderers). */
  track<T extends { dispose(): void }>(target: T): T
  /** Adds an event listener and registers its removal. */
  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void
  listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions): void
  /** Runs every cleanup once, newest first. Safe to call more than once. */
  dispose(): void
  readonly size: number
  readonly disposed: boolean
}

export function createCleanupStack(onError: (error: unknown) => void = (e) => console.error(e)): CleanupStack {
  let cleanups: Array<() => void> = []
  let disposed = false
  return {
    add(cleanup) {
      if (disposed) {
        cleanup()
        return cleanup
      }
      cleanups.push(cleanup)
      return cleanup
    },
    track(target) {
      this.add(() => target.dispose())
      return target
    },
    listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions) {
      target.addEventListener(type, handler, options)
      this.add(() => target.removeEventListener(type, handler, options))
    },
    dispose() {
      if (disposed) return
      disposed = true
      const pending = cleanups
      cleanups = []
      for (let i = pending.length - 1; i >= 0; i--) {
        try {
          pending[i]?.()
        } catch (error) {
          onError(error)
        }
      }
    },
    get size() {
      return cleanups.length
    },
    get disposed() {
      return disposed
    },
  }
}
```

Usage in a Vue component: `const stack = createCleanupStack(); onMounted(() => { const renderer = stack.track(new THREE.WebGLRenderer({ canvas })); stack.listen(window, 'resize', onResize); stack.add(() => renderer.setAnimationLoop(null)) }); onBeforeUnmount(() => stack.dispose())`. In React, return `stack.dispose` from the effect. A cleanup added after dispose runs immediately, which is what late async loads need.

```ts
// @verify creative:lifecycle/cleanup-stack.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createCleanupStack } from './cleanup-stack'

describe('createCleanupStack', () => {
  it('runs cleanups once, newest first, and isolates errors', () => {
    const order: string[] = []
    const onError = vi.fn()
    const stack = createCleanupStack(onError)
    stack.add(() => order.push('first'))
    stack.add(() => {
      throw new Error('boom')
    })
    stack.add(() => order.push('last'))
    expect(stack.size).toBe(3)

    stack.dispose()
    stack.dispose()

    expect(order).toEqual(['last', 'first'])
    expect(onError).toHaveBeenCalledTimes(1)
    expect(stack.disposed).toBe(true)
    expect(stack.size).toBe(0)
  })

  it('tracks disposables and removes listeners it added', () => {
    const stack = createCleanupStack()
    const geometry = { dispose: vi.fn() }
    expect(stack.track(geometry)).toBe(geometry)

    const target = new EventTarget()
    const handler = vi.fn()
    stack.listen(target, 'tick', handler)
    target.dispatchEvent(new Event('tick'))
    expect(handler).toHaveBeenCalledTimes(1)

    stack.dispose()
    target.dispatchEvent(new Event('tick'))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(geometry.dispose).toHaveBeenCalledTimes(1)
  })

  it('runs a cleanup immediately when added after dispose (late async work)', () => {
    const stack = createCleanupStack()
    stack.dispose()
    const late = vi.fn()
    stack.add(late)
    expect(late).toHaveBeenCalledTimes(1)
  })
})
```

## Testing disposal (tested)

Three.js objects work in Node without a renderer, so disposal logic is unit-testable. `disposeObject` from `threejs.md` is verified like this: real geometries, materials and textures emit a `dispose` event; the test asserts every one fired. A material shared by two meshes is disposed twice, which Three.js tolerates; a geometry is disposed exactly once.

```ts
// @verify creative:three/dispose.test.ts
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { disposeObject } from './create-scene'

/** Builds a small scene graph without a renderer: Three.js objects work in Node. */
function buildScene() {
  const scene = new THREE.Scene()
  const map = new THREE.Texture()
  const shared = new THREE.MeshStandardMaterial({ map })
  const box = new THREE.Mesh(new THREE.BoxGeometry(), shared)
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(), shared)
  const multi = new THREE.Mesh(new THREE.PlaneGeometry(), [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()])
  const group = new THREE.Group()
  group.add(box, sphere)
  scene.add(group, multi, new THREE.AmbientLight())
  return { scene, map, shared, box, sphere, multi }
}

describe('disposeObject', () => {
  it('disposes every geometry, material and texture under the root', () => {
    const { scene, map, shared, box, sphere, multi } = buildScene()
    const disposed: string[] = []
    const watch = (target: { addEventListener(type: 'dispose', listener: () => void): void }, name: string) =>
      target.addEventListener('dispose', () => disposed.push(name))
    watch(box.geometry, 'box.geometry')
    watch(sphere.geometry, 'sphere.geometry')
    watch(multi.geometry, 'multi.geometry')
    watch(shared, 'shared.material')
    watch(map, 'map.texture')
    const materials = multi.material as THREE.Material[]
    materials.forEach((m, i) => watch(m, `multi.material[${i}]`))

    disposeObject(scene)

    expect(disposed.sort()).toEqual(
      // the shared material is reached from two meshes: its dispose (and its texture's) runs twice; Three.js dispose is idempotent
      ['box.geometry', 'sphere.geometry', 'multi.geometry', 'multi.material[0]', 'multi.material[1]', 'shared.material', 'shared.material', 'map.texture', 'map.texture'].sort(),
    )
  })

  it('calls dispose exactly once per unique geometry (shared materials are disposed per mesh)', () => {
    const { scene, box, shared } = buildScene()
    const geometrySpy = vi.spyOn(box.geometry, 'dispose')
    const materialSpy = vi.spyOn(shared, 'dispose')

    disposeObject(scene)

    expect(geometrySpy).toHaveBeenCalledTimes(1)
    // the material is shared by two meshes: dispose is idempotent in Three.js, so twice is harmless
    expect(materialSpy).toHaveBeenCalledTimes(2)
  })

  it('ignores lights, groups and cameras', () => {
    const scene = new THREE.Scene()
    scene.add(new THREE.PerspectiveCamera(), new THREE.DirectionalLight(), new THREE.Group())
    expect(() => disposeObject(scene)).not.toThrow()
  })
})
```

For components: mount, unmount, and assert `renderer.info.memory.geometries === 0` and `.textures === 0` on a renderer created with a headless context in Playwright (`page.evaluate`), or assert the cleanup stack's `disposed` flag and the dispose spies in Vitest with a mocked renderer.

## Testing GSAP cleanup

GSAP needs a DOM; test it in `happy-dom`/`jsdom` (Vitest `environment: 'happy-dom'` for that file) or in Playwright:

- **Unit (happy-dom)**: mount the component with Testing Library, assert `gsap.globalTimeline.getChildren().length` (or `ScrollTrigger.getAll().length`) grows on mount and returns to the previous value after unmount; `ctx.revert()` also restores inline styles, so assert `element.style.transform === ''` after unmount. Register plugins in the test setup; ScrollTrigger measurements are meaningless without layout, so test counts and reverts, not positions.
- **Playwright**: navigate to the page, read `window.gsap.globalTimeline.getChildren().length` and `ScrollTrigger.getAll().length` via `page.evaluate` (expose `gsap` on `window` in development builds only), navigate away within the SPA, assert both return to baseline; emulate reduced motion (`page.emulateMedia({ reducedMotion: 'reduce' })`) and assert no scrubbed triggers exist.
- **Leak loop**: in Playwright, open and close the animated component 20 times and take two heap snapshots through CDP (`HeapProfiler.takeHeapSnapshot`); detached DOM nodes and growing `Tween` counts indicate missing reverts.

## Leak detection procedure

1. Run the plugin's lexical scan for resources created without a visible cleanup: `node ${CLAUDE_SKILL_DIR}/../frontend-architect/scripts/leak-patterns.mjs <project-root>` (or `${CLAUDE_PLUGIN_ROOT}/skills/frontend-architect/scripts/leak-patterns.mjs`). Every finding is a lead, not a verdict: cleanup may live in a helper or a VueUse composable.
2. In the browser, open the component, interact, close it; repeat 10 to 20 times. In the Memory panel take a heap snapshot before and after; filter by "Detached" and by the engine's classes (`Tween`, `Timeline`, `ScrollTrigger`, `Mesh`, `BufferGeometry`, `Texture`). Growing counts are leaks.
3. For Three.js read `renderer.info.memory` and `renderer.info.render.calls` after disposal; both should return to the baseline measured before the scene mounted.
4. Watch `performance.now()` deltas per frame in the loop; a frame time that climbs across cycles means duplicated loops or observers.
5. Fix the owner: give the resource a factory with a cleanup, register it in a cleanup stack or GSAP context, and add the unit test above to the component's suite so the leak cannot return.
