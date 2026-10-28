// literal dynamic import (resolvable) and a non-literal one (unknown)
export async function loadReports() {
  const mod = await import('@/features/reports/report')
  return mod.buildReport()
}
export async function loadPlugin(name: string) {
  const mod = await import(`./plugins/${name}`)
  return mod
}
