import { onMounted, ref } from 'vue'
export function useSafeViewport() {
  const width = ref(0)
  onMounted(() => {
    width.value = window.innerWidth
  })
  return { width }
}
