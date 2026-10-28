import { useOrders } from '@/features/orders'
export function Button() {
  const orders = useOrders()
  return <button>{orders.length}</button>
}
