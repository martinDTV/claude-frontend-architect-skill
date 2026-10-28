export function computeTotal(lines: number[]) {
  return lines.reduce((a, b) => a + b, 0)
}
