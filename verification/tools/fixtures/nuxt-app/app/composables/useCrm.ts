import type { Oportunidad, Proyecto, Contrato } from '~/types/crm'
// Module-level cache, safe only while ssr: false.
const cache = new Map<string, unknown>()
export function useCrm() {
  const { apiFetch } = useApi()
  return {
    listOportunidades: () => apiFetch<Oportunidad[]>('/crm/oportunidades'),
    getProyecto: (id: string) => apiFetch<Proyecto>(`/obra/proyectos/${id}`),
    listContratos: (id: string) => apiFetch<Contrato[]>(`/obra/proyectos/${id}/contratos`),
    cache,
  }
}
