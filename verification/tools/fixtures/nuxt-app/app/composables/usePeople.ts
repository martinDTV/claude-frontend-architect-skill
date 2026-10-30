export function usePeople() {
  const people = useState<{ id: string; name: string }[]>('people:directory', () => [])
  return { people }
}
