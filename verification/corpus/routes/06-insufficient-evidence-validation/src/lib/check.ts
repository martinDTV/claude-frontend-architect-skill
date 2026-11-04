export function assertValid(input: { body: unknown }) {
  if (typeof input.body !== 'string' || input.body.length === 0 || input.body.length > 2000) {
    throw new Error('invalid comment body')
  }
  return { body: input.body as string }
}
