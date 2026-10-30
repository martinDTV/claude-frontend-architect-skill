export function useDocuments() {
  const { apiFetch } = useApi()
  return { listDocuments: () => apiFetch<string[]>('/projects/documents') }
}
