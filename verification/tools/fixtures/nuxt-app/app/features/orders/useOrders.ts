import { computeTotal } from './internal'
export interface Order { id: string; lines: number[] }
export function useOrders() {
  return { total: (o: Order) => computeTotal(o.lines) }
}
