export async function POST(request: Request) {
  return Response.json({ received: true, len: (await request.text()).length })
}
