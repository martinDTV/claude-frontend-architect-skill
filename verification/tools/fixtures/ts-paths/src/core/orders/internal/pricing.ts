export interface PriceInput { amountCents: number; taxRate: number }
export function priceWithTax(input: PriceInput): number {
  return Math.round(input.amountCents * (1 + input.taxRate))
}
export const DEFAULT_TAX = 0.16
