// The catalogue's filters, search, sort and page live in the URL (data-tables.md): the rail edits them, the grid renders
// them, a shared link opens the same shelf, back returns to the previous one.
import { applyCatalogState, CATALOG, catalogStateToQuery, DEFAULT_CATALOG_STATE, queryToCatalogState, type CatalogState } from '~/lib/ui/shop/catalog'

export function useCatalogState() {
  const route = useRoute()
  const router = useRouter()
  const state = computed<CatalogState>(() => queryToCatalogState(route.query as Record<string, string>))
  const result = computed(() => applyCatalogState(CATALOG, state.value))
  const set = (patch: Partial<CatalogState>, { keepPage = false } = {}) => router.replace({ query: catalogStateToQuery({ ...state.value, ...patch, page: keepPage ? (patch.page ?? state.value.page) : 1 }) })
  const toggle = <K extends 'makers' | 'forms' | 'glazes' | 'availability'>(key: K, value: CatalogState[K][number]) => {
    const list = state.value[key] as string[]
    set({ [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] } as Partial<CatalogState>)
  }
  const clear = () => router.replace({ query: catalogStateToQuery({ ...DEFAULT_CATALOG_STATE, sort: state.value.sort }) })
  return { state, result, set, toggle, clear }
}
