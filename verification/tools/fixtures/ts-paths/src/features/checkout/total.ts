// alias import that bypasses the public entry of core/orders (hidden coupling through an alias)
import { priceWithTax, DEFAULT_TAX } from '#core/orders/internal/pricing'
// type-only import of a domain type: compile-time coupling only
import type { Order } from '#core/orders'
// import through the barrel: runtime
import { orderPaid } from '#core/orders'
// side effect import
import '@/lib/polyfill'
export function checkoutTotal(order: Order) {
  orderPaid(order)
  return priceWithTax({ amountCents: order.totalCents, taxRate: DEFAULT_TAX })
}
