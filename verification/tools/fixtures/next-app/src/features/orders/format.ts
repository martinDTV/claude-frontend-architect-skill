// pure helper imported by a client component: legitimate shared code, must not be reported
export function formatOrderId(id: number) {
  return `#${String(id).padStart(5, '0')}`
}
