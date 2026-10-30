export function useFeatureFlags() {
  const permissions = useState<string[]>('flags-permissions', () => [])
  return { canSee: (m: string) => permissions.value.includes(m) }
}
