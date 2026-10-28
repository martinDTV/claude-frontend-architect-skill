import { buildReport } from '~/features/reports'
export function exportCsv(rows: unknown[]) {
  return rows.length ? buildReport() : ''
}
