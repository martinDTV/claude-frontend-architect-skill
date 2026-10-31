import { AssetsLab } from './AssetsLab'

export const metadata = { title: 'Asset lab' }

export default function AssetsLabPage() {
  return (
    <main style={{ padding: '1rem' }}>
      <h1>Asset lab</h1>
      <AssetsLab />
    </main>
  )
}
