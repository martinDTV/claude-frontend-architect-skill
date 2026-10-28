export function usePlanos() {
  const { apiFetch } = useApi()
  return { listPlanos: () => apiFetch<string[]>('/obra/planos') }
}
