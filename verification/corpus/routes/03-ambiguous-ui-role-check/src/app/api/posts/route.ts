import { getServerSession } from '@/lib/auth'

export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session || session.user.role !== 'editor') {
    return new Response('Forbidden', { status: 403 })
  }
  const body = await request.json()
  return Response.json({ id: '1', ...body })
}
