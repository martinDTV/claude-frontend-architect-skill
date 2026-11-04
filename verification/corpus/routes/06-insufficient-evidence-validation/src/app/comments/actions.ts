'use server'

import { getSession } from '@/lib/auth'
import { assertValid } from '@/lib/check'

export async function addComment(formData: FormData) {
  const session = await getSession()
  const input = assertValid({ body: formData.get('body') })
  return { ok: true, author: session.userId, body: input.body }
}
