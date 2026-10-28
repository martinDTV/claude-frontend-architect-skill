import { invoiceTitle } from '#core/billing/invoice'
export function checkoutLabel() {
  return 'Checkout'
}
export function receipt(id: string) {
  return invoiceTitle(id)
}
