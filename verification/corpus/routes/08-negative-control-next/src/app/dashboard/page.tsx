import { getServerSession } from '@/lib/auth'

export default async function DashboardPage() {
  const session = await getServerSession()
  return <h1>Welcome {session.userId}</h1>
}
