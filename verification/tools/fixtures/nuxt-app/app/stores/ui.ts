import { defineStore } from 'pinia'
export const useUiStore = defineStore('ui', () => {
  const loading = ref(false)
  const sidebar = ref(true)
  function toggle() {
    sidebar.value = !sidebar.value
  }
  return { loading, sidebar, toggle }
}, { persist: { pick: ['sidebar'] } })
