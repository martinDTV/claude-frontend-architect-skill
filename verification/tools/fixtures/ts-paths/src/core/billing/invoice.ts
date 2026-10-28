// circular dependency with features/checkout (runtime both ways)
import { checkoutLabel } from '@/features/checkout/label'
export function invoiceTitle(id: string) {
  return `${checkoutLabel()} #${id}`
}
