import { OrderList } from '@/features/orders'
import { calcTax } from '@/features/billing/internal/calc'
export default async function OrdersPage() {
  return <main><h1>Orders {calcTax(1)}</h1><OrderList /></main>
}
