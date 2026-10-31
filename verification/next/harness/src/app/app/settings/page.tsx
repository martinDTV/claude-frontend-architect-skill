import type { Metadata } from 'next'
import { SettingsPage } from '@/features/atlas/other-pages'

export const metadata: Metadata = { title: 'Settings' }

export default function Page() {
  return <SettingsPage />
}
