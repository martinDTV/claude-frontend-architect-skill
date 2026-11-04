import { db } from '@/lib/db'

export async function POST(request: Request) {
  const rows = await request.json()
  await db.bulkInsert(rows)
  return Response.json({ inserted: rows.length })
}
