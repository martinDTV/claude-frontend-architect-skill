'use server'
import { cookies } from 'next/headers'

export async function deleteOrder(formData: FormData) {
  const id = formData.get('id')
  await fetch(`${process.env.API_URL}/orders/${id}`, { method: 'DELETE' })
}

export async function renameOrder(formData: FormData) {
  const session = (await cookies()).get('session')?.value
  if (!session) return { ok: false }
  const id = String(formData.get('id'))
  await fetch(`${process.env.API_URL}/orders/${id}`, { method: 'PATCH', headers: { Cookie: `session=${session}` } })
  return { ok: true }
}
