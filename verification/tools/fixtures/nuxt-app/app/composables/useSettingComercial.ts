export function useSettingComercial() {
  const permisos = useState<string[]>('comercial-permisos', () => [])
  return { veModulo: (m: string) => permisos.value.includes(m) }
}
