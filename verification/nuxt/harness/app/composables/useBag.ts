// The bag (persistence.md, state-vue.md): client-owned shared state in useState, the pure reducer from the shared shop
// domain, a versioned localStorage record read on the client only, written on every change and synced across tabs
// through the storage event. The drawer's open state lives here too because the header button and the detail page's
// add-to-bag both open it.
import { CATALOG } from '~/lib/ui/shop/catalog'
import { CART_KEY, cartReducer, cartTotals, EMPTY_CART, readCart, writeCart, type Cart, type CartAction, type CartIntent } from '~/lib/ui/shop/cart'

export function useBag() {
  const cart = useState<Cart>('ember-bag', () => EMPTY_CART)
  const loaded = useState('ember-bag-loaded', () => false)
  const open = useState('ember-bag-open', () => false)
  const lastAdded = useState<{ pieceId: string; variantId: string; at: number } | null>('ember-bag-last', () => null)
  const totals = computed(() => cartTotals(cart.value, CATALOG))
  // after hydration (the server rendered an empty bag), once per page load; other tabs arrive through the storage event
  onMounted(() => {
    if (loaded.value) return
    cart.value = readCart(window.localStorage, CATALOG)
    loaded.value = true
    window.addEventListener('storage', (e) => { if (e.key === CART_KEY) cart.value = readCart(window.localStorage, CATALOG) })
  })
  function dispatch(action: CartIntent) {
    const next = cartReducer(cart.value, { ...action, at: new Date().toISOString() } as CartAction, CATALOG)
    if (next === cart.value) return false
    cart.value = next
    if (import.meta.client) writeCart(window.localStorage, next)
    if (action.type === 'add') lastAdded.value = { pieceId: action.pieceId, variantId: action.variantId, at: Date.now() }
    return true
  }
  return { cart, totals, open, loaded, lastAdded, dispatch }
}
