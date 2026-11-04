import { z } from 'zod'
import { getServerSession } from '@/lib/auth'

const schema = z.object({ sku: z.string(), qty: z.number() })

export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const order = schema.parse(await request.json())
  return Response.json({ id: '1', ...order })
}
