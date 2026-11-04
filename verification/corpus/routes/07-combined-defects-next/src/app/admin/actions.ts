'use server'

import { db } from '@/lib/db'

export async function wipeTenant(formData: FormData) {
  const tenantId = formData.get('tenantId') as string
  await db.bulkInsert([{ op: 'wipe', tenantId }])
  return { ok: true }
}
