import type { Metadata } from 'next'
import { ShipmentsPage } from '@/features/atlas/shipments-page'

export const metadata: Metadata = { title: 'Shipments' }

export default function Page() {
  return <ShipmentsPage />
}
