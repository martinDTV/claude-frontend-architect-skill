import type { Metadata } from 'next'
import { DesignPage } from './DesignPage'

export const metadata: Metadata = { title: 'Design contract' }

export default function Page() {
  return <DesignPage />
}
