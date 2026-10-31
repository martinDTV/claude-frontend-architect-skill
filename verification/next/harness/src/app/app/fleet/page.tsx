import type { Metadata } from 'next'
import { FleetPage } from '@/features/atlas/other-pages'

export const metadata: Metadata = { title: 'Fleet' }

export default function Page() {
  return <FleetPage />
}
