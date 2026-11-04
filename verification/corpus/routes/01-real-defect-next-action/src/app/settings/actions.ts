'use server'

import { db } from '@/lib/db'

export async function updateEmail(formData: FormData) {
  const email = formData.get('email') as string
  await db.user.update({ where: { current: true }, data: { email } })
  return { ok: true }
}
