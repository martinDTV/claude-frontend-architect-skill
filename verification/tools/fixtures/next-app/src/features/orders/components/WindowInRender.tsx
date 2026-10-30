'use client'
// browser API read while rendering: the component also renders on the server (hydration mismatch / ReferenceError)
export function WindowInRender() {
  const width = window.innerWidth
  return <small>{width}px</small>
}
