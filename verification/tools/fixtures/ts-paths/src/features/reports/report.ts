import { z } from 'zod'
import { Button } from '#ui'
import type { PriceInput } from '#core/orders/internal/pricing'
import { missing } from './does-not-exist'
export const schema = z.object({ id: z.string() })
export function buildReport(): { ok: boolean; input?: PriceInput } {
  return { ok: Boolean(Button) && Boolean(missing) }
}
