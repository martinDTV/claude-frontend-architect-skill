import type { Metadata } from 'next'
import { NewShipmentPage } from '@/features/atlas/other-pages'

export const metadata: Metadata = { title: 'New shipment' }

export default function Page() {
  return <NewShipmentPage />
}
