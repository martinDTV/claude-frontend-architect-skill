import { ref } from 'vue'
// module scope: evaluated when the module loads, on the server too
const initial = window.innerWidth
export function useViewport() {
  const width = ref(initial)
  return { width }
}
