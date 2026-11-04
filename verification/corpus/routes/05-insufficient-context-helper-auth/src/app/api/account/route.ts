import { ensureLoggedIn } from '@/lib/gate'

export async function DELETE(request: Request) {
  const actor = await ensureLoggedIn(request)
  await deleteAccount(actor.id)
  return new Response(null, { status: 204 })
}

async function deleteAccount(id: string) { void id }
