export function useBaseFormat() {
  return { money: (n: number) => n.toFixed(2) }
}
