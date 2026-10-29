// a Server Component (no 'use client') importing a client-only module through a plain helper
import { readViewport } from '../../../../features/orders/browser'
import { OrderBadge } from '../../../../features/orders/components/OrderBadge'

export default function WidgetsPage() {
  const vp = readViewport()
  return <OrderBadge label={`${vp.width}px`} />
}
