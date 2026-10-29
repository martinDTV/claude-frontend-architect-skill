import 'client-only'
// browser-only helper: must never be reached from a Server Component
export function readViewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}
