let enVuelo: Promise<unknown> | null = null
export function useCatalogoWbs() {
  const catalogo = useState<string[]>('catalogo-wbs', () => [])
  return { catalogo, enVuelo }
}
