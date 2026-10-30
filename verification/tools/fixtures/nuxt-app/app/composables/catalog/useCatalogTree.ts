let enVuelo: Promise<unknown> | null = null
export function useCatalogTree() {
  const catalog = useState<string[]>('catalog-tree', () => [])
  return { catalog, enVuelo }
}
