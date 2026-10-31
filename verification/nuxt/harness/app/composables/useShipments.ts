// The shipments data region (enterprise-application.md: five states per data region). One composable owns loading,
// empty, error and success, cancels a request the page no longer wants, and takes its api mode from the URL so every
// state can be reached without code changes (?api=fail|empty|slow).
import { DATASET, type Shipment } from '~/lib/ui/saas/data'
import { apiModeFrom, createFakeApi, type ApiError, type ApiMode } from '~/lib/ui/saas/forms'

const api = createFakeApi(DATASET)
export const shipmentsApi = api

export type RegionState = 'loading' | 'empty' | 'error' | 'ready'

export function useShipments() {
  const route = useRoute()
  const rows = useState<Shipment[]>('atlas-shipments', () => [])
  const state = useState<RegionState>('atlas-shipments-state', () => 'loading')
  const error = useState<{ message: string; requestId: string } | null>('atlas-shipments-error', () => null)
  const mode = computed<ApiMode>(() => apiModeFrom(new URLSearchParams(route.query as Record<string, string>)))
  let controller: AbortController | null = null

  async function load() {
    controller?.abort()
    controller = new AbortController()
    state.value = 'loading'
    error.value = null
    try {
      const data = await api.shipments({ mode: mode.value, signal: controller.signal })
      rows.value = data
      state.value = data.length ? 'ready' : 'empty'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const err = e as ApiError
      error.value = { message: err.message, requestId: err.requestId ?? '' }
      state.value = 'error'
    }
  }

  onMounted(load)
  onBeforeUnmount(() => controller?.abort())
  watch(mode, load)

  return { rows, state, error, mode, reload: load }
}
