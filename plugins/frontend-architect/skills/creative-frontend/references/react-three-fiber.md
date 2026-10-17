# React Three Fiber (Three.js for React and Next.js)

Verified: `@react-three/fiber` 9.8 (peer `react >=19 <19.4`), `@react-three/drei` 10.7, `@react-three/postprocessing` 3.2. Check the React peer range before upgrading React.

## Setup in Next.js

- R3F components are Client Components (`'use client'`). Load the scene with `next/dynamic` and `ssr: false` from a Client Component, and render a poster image as the fallback (also the LCP element).
- drei provides controls, loaders (`useGLTF`), environment maps, text and performance helpers (`PerformanceMonitor`, `AdaptiveDpr`). Prefer them to custom code.

## Component pattern

```tsx
// @verify react:features/hero/SpinningBox.tsx
'use client'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'

export function SpinningBox({ speed = 0.6 }: { speed?: number }) {
  const ref = useRef<Mesh>(null)
  useFrame((_state, delta) => {
    if (!ref.current) return
    ref.current.rotation.y += delta * speed
    ref.current.rotation.x += delta * speed * 0.5
  })
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#4f46e5" />
    </mesh>
  )
}
```

```tsx
// @verify react:features/hero/HeroScene.tsx
'use client'
import { Canvas } from '@react-three/fiber'
import { Suspense, useSyncExternalStore } from 'react'
import { SpinningBox } from './SpinningBox'

const query = '(prefers-reduced-motion: reduce)'
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export default function HeroScene() {
  const reducedMotion = useReducedMotion()
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [3, 2, 4], fov: 45 }} aria-hidden>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <Suspense fallback={null}>
        <SpinningBox speed={reducedMotion ? 0 : 0.6} />
      </Suspense>
    </Canvas>
  )
}
```

Usage in a Client Component: `const HeroScene = dynamic(() => import('@/features/hero/HeroScene'), { ssr: false, loading: () => <img src="/hero-poster.webp" alt="" /> })`.

Rules:
- Mutate in `useFrame` through refs; never `setState` every frame.
- `frameloop="demand"` for static scenes, invalidating on change.
- Wrap async loaders in `<Suspense>`; preload models with `useGLTF.preload`.
- Integrate GSAP with `useGSAP` animating object properties via refs.
