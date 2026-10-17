# TresJS (Three.js for Vue and Nuxt)

Verified: `@tresjs/core` 5.9, `@tresjs/nuxt` 5.7, `@tresjs/cientos` 5.9. In v5 the render loop composable is `useLoop()` with `onBeforeRender`; older examples using `useRenderLoop` are for v4 and earlier.

## Setup

- Nuxt: install `@tresjs/nuxt` (plus `three` and `@tresjs/core`) and add it to `modules`; it configures the template compiler for `<Tres*>` elements and auto-imports. Vue + Vite: add `templateCompilerOptions` from `@tresjs/core` to the Vue plugin.
- `@tresjs/cientos` provides helpers (OrbitControls, GLTF loading, environment, text). Use it before writing your own.
- The example below also uses `@vueuse/core` (`usePreferredReducedMotion`).
- The canvas renders on the client only; in Nuxt wrap it in `<ClientOnly>` with a poster fallback, and lazy-load the component (`<LazyHeroScene>`) when below the fold.

## Component pattern

Scene logic lives in a child component inside `<TresCanvas>` (composables like `useLoop` require the Tres context).

```vue
<!-- @verify nuxt:components/three/SpinningBox.vue -->
<script setup lang="ts">
import { useLoop } from '@tresjs/core'
import { shallowRef } from 'vue'
import type { Mesh } from 'three'

const props = withDefaults(defineProps<{ speed?: number }>(), { speed: 0.6 })
const box = shallowRef<Mesh | null>(null)

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  if (!box.value) return
  box.value.rotation.y += delta * props.speed
  box.value.rotation.x += delta * props.speed * 0.5
})
</script>

<template>
  <TresMesh ref="box">
    <TresBoxGeometry :args="[1, 1, 1]" />
    <TresMeshStandardMaterial color="#4f46e5" />
  </TresMesh>
</template>
```

```vue
<!-- @verify nuxt:components/three/HeroScene.vue -->
<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { usePreferredReducedMotion } from '@vueuse/core'
import SpinningBox from './SpinningBox.vue'

const reducedMotion = usePreferredReducedMotion()
</script>

<template>
  <TresCanvas clear-color="#0b0b12" :dpr="[1, 2]" render-mode="always" aria-hidden="true">
    <TresPerspectiveCamera :position="[3, 2, 4]" :look-at="[0, 0, 0]" />
    <TresAmbientLight :intensity="0.6" />
    <TresDirectionalLight :position="[3, 4, 5]" :intensity="1.2" />
    <SpinningBox :speed="reducedMotion === 'reduce' ? 0 : 0.6" />
  </TresCanvas>
</template>
```

Rules:
- Use `shallowRef` for Three.js objects; deep reactivity on meshes is expensive and unnecessary.
- Mutate objects in the loop callback, not through reactive props every frame.
- Integrate GSAP by animating the Three.js object properties (`gsap.to(box.value.rotation, …)`) inside a GSAP context reverted on unmount.
- The canvas is decorative here (`aria-hidden`); if it conveys information, provide an accessible DOM equivalent.
