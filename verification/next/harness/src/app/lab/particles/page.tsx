import { ParticlesLab } from './ParticlesLab'

export const metadata = { title: 'Particle lab' }

export default function ParticlesLabPage() {
  return (
    <main style={{ padding: '1rem' }}>
      <h1>Particle lab</h1>
      <ParticlesLab />
    </main>
  )
}
