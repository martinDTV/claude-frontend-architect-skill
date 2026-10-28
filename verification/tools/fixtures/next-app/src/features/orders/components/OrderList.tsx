import { getOrders } from '../server'
export async function OrderList() {
  const orders = await getOrders()
  return <ul>{orders.map((o) => <li key={o.id}>{o.id}</li>)}</ul>
}
