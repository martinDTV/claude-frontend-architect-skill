import type { Order } from './types'
export function orderPaid(order: Order) {
  return { type: 'order.paid' as const, id: order.id }
}
