// Reads the per-request instance the plugin provided; declares nothing mutable at module scope.
export function useApi() {
  const { $api } = useNuxtApp()
  return { apiFetch: <T>(url: string) => $api<T>(url) }
}
