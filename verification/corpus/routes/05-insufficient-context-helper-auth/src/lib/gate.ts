import { cookies } from 'next/headers'

export async function ensureLoggedIn(_request: Request) {
  const store = await cookies()
  const token = store.get('session')?.value
  if (!token) throw new Response('Unauthorized', { status: 401 })
  return { id: 'user-from-token' }
}
