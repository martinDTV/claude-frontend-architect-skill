// no 'server-only' marker, but it reads a private env var: reaching the client bundle would inline it
export function secretLabel() {
  return process.env.STRIPE_SECRET_KEY ? 'configured' : 'missing'
}
