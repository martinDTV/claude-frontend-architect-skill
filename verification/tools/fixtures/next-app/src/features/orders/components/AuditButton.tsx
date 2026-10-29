'use client'
import { logAudit } from '../audit.actions'
export function AuditButton({ id }: { id: string }) {
  return <button onClick={() => logAudit(id)}>audit</button>
}
