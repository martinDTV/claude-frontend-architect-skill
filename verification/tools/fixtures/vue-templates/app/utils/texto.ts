export function contar(n: number, singular: string, plurales: string): string {
  return `${n} ${n === 1 ? singular : plurales}`
}
export function plural(n: number, singular: string, plurales: string): string {
  return n === 1 ? singular : plurales
}
