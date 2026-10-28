export function usePersonas() {
  const personas = useState<{ id: string; nombre: string }[]>('personas:padron', () => [])
  return { personas }
}
