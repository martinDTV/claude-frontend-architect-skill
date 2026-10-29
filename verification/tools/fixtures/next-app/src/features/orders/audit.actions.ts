'use server'
import { authorize } from '../../lib/http/client'

// private env read inside a Server Action: it never reaches the browser even when a client component imports this module
export async function logAudit(orderId: string) {
  await authorize('orders:audit')
  const webhook = process.env.AUDIT_WEBHOOK_URL
  return fetch(`${webhook}/audit`, { method: 'POST', body: orderId })
}
