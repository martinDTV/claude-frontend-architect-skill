'use server'

import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const schema = z.object({ name: z.string().min(1) })

export async function renameWorkspace(formData: FormData) {
  const session = await getServerSession()
  if (!session) throw new Error('Unauthorized')
  const input = schema.parse({ name: formData.get('name') })
  return { ok: true, name: input.name, by: session.userId }
}
