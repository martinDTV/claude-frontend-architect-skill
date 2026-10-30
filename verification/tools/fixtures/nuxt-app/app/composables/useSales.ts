import type { Lead, Project, Contrato } from '~/types/sales'
// Module-level cache, safe only while ssr: false.
const cache = new Map<string, unknown>()
export function useSales() {
  const { apiFetch } = useApi()
  return {
    listLeads: () => apiFetch<Lead[]>('/sales/leads'),
    getProyecto: (id: string) => apiFetch<Project>(`/projects/proyectos/${id}`),
    listContratos: (id: string) => apiFetch<Contrato[]>(`/projects/proyectos/${id}/contratos`),
    cache,
  }
}
