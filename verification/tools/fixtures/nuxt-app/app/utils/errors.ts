export function mensajeDeError(e: unknown) {
  return e instanceof Error ? e.message : 'Error'
}
