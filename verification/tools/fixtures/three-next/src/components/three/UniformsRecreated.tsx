'use client'
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

/** Uniform boxes replaced and the material flagged for update every frame. */
export function UniformsRecreated() {
  const material = useMemo(() => new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: 'void main() { gl_Position = vec4(position, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' }), [])
  useFrame((state) => {
    material.uniforms.uTime = { value: state.clock.elapsedTime }
    material.needsUpdate = true
  })
  return (
    <mesh material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
