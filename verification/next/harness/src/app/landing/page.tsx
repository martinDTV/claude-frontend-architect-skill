import type { Metadata } from 'next'
import { LumenLanding } from '@/features/lumen/landing'

export const metadata: Metadata = { title: 'Lumen · a notebook that files itself', description: 'Lumen writes like paper, lasts six weeks on a charge and puts every page in your own folder as text. Pre-order, 249 €.' }

// a Server Component: the whole page renders on the server; the client component animates after hydration
export default function Page() {
  return <LumenLanding />
}
