/**
 * Table state as pure functions (data-tables.md: the URL is the table state): sort, filters, search, pagination, and
 * the query-string round trip, so a view can be shared and a browser check can assert exact rows.
 */
import type { Shipment, ShipmentStatus } from './data'

export type SortKey = 'reference' | 'customer' | 'lane' | 'status' | 'promised' | 'eta' | 'weightKg' | 'pallets' | 'updatedAt'
export type SortDir = 'asc' | 'desc'
export interface TableState {
  sort: { key: SortKey; dir: SortDir }
  status: ShipmentStatus[]
  lane: string | null
  assigned: 'any' | 'yes' | 'no'
  search: string
  page: number
  pageSize: number
}
export const DEFAULT_TABLE_STATE: TableState = { sort: { key: 'promised', dir: 'asc' }, status: [], lane: null, assigned: 'any', search: '', page: 1, pageSize: 25 }
export const PAGE_SIZES = [10, 25, 50, 100] as const
const STATUSES: ShipmentStatus[] = ['planned', 'in-transit', 'at-risk', 'late', 'delivered']
const SORT_KEYS: SortKey[] = ['reference', 'customer', 'lane', 'status', 'promised', 'eta', 'weightKg', 'pallets', 'updatedAt']
const STATUS_ORDER: Record<ShipmentStatus, number> = { late: 0, 'at-risk': 1, 'in-transit': 2, planned: 3, delivered: 4 }

export interface TableResult { rows: Shipment[]; total: number; pages: number; page: number; from: number; to: number }

export function applyTableState(all: Shipment[], state: TableState): TableResult {
  const q = state.search.trim().toLowerCase()
  let rows = all.filter((s) => (state.status.length === 0 || state.status.includes(s.status)) && (!state.lane || s.lane === state.lane) && (state.assigned === 'any' || (state.assigned === 'yes') === Boolean(s.driverId && s.vehicleId)) && (!q || s.reference.toLowerCase().includes(q) || s.customer.toLowerCase().includes(q) || s.lane.toLowerCase().includes(q) || s.destination.toLowerCase().includes(q)))
  const { key, dir } = state.sort
  const sign = dir === 'asc' ? 1 : -1
  rows = [...rows].sort((a, b) => {
    let c = 0
    if (key === 'status') c = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    else if (key === 'weightKg' || key === 'pallets') c = a[key] - b[key]
    else c = String(a[key]).localeCompare(String(b[key]))
    return c * sign || a.id.localeCompare(b.id)
  })
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / state.pageSize))
  const page = Math.min(Math.max(1, state.page), pages)
  const from = total === 0 ? 0 : (page - 1) * state.pageSize + 1
  const to = Math.min(total, page * state.pageSize)
  return { rows: rows.slice(from ? from - 1 : 0, to), total, pages, page, from, to }
}

/** Only what differs from the defaults goes into the URL. */
export function stateToQuery(state: TableState): Record<string, string> {
  const q: Record<string, string> = {}
  if (state.sort.key !== DEFAULT_TABLE_STATE.sort.key || state.sort.dir !== DEFAULT_TABLE_STATE.sort.dir) q.sort = `${state.sort.key}:${state.sort.dir}`
  if (state.status.length) q.status = state.status.join(',')
  if (state.lane) q.lane = state.lane
  if (state.assigned !== 'any') q.assigned = state.assigned
  if (state.search) q.q = state.search
  if (state.page > 1) q.page = String(state.page)
  if (state.pageSize !== DEFAULT_TABLE_STATE.pageSize) q.size = String(state.pageSize)
  return q
}

export function queryToState(query: Record<string, string | string[] | undefined | null>): TableState {
  const one = (k: string) => { const v = query[k]; return Array.isArray(v) ? v[0] ?? '' : v ?? '' }
  const state: TableState = { ...DEFAULT_TABLE_STATE, status: [], sort: { ...DEFAULT_TABLE_STATE.sort } }
  const sort = one('sort')
  if (sort) {
    const [key, dir] = sort.split(':')
    if (SORT_KEYS.includes(key as SortKey)) state.sort.key = key as SortKey
    if (dir === 'asc' || dir === 'desc') state.sort.dir = dir
  }
  const status = one('status')
  if (status) state.status = status.split(',').filter((s): s is ShipmentStatus => STATUSES.includes(s as ShipmentStatus))
  const lane = one('lane')
  if (lane) state.lane = lane
  const assigned = one('assigned')
  if (assigned === 'yes' || assigned === 'no') state.assigned = assigned
  const q = one('q')
  if (q) state.search = q.slice(0, 80)
  const page = Number(one('page'))
  if (Number.isInteger(page) && page > 1) state.page = page
  const size = Number(one('size'))
  if (PAGE_SIZES.includes(size as (typeof PAGE_SIZES)[number])) state.pageSize = size
  return state
}

export function toggleSort(state: TableState, key: SortKey): TableState {
  const dir: SortDir = state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc'
  return { ...state, sort: { key, dir }, page: 1 }
}

export const ACTIVE_FILTERS = (state: TableState): string[] => [...state.status.map((s) => `status:${s}`), ...(state.lane ? [`lane:${state.lane}`] : []), ...(state.assigned !== 'any' ? [`assigned:${state.assigned}`] : []), ...(state.search ? [`search:${state.search}`] : [])]
