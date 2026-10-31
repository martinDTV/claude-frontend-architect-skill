import { ShadersLab } from './ShadersLab'

export const metadata = { title: 'Shader lab' }

export default function ShadersLabPage() {
  return (
    <main style={{ padding: '1rem' }}>
      <h1>Shader lab</h1>
      <ShadersLab />
    </main>
  )
}
