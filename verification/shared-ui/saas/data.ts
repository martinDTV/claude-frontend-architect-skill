/**
 * Atlas Logistics, the enterprise reference application (1.5 increment 5, block C): the domain the Nuxt and the Next
 * apps render. Deterministic data from a seeded generator and a fixed clock, so server and client render the same
 * rows (no Date.now() or Math.random() in a render path) and the browser checks can assert exact numbers.
 */
export type ShipmentStatus = 'planned' | 'in-transit' | 'at-risk' | 'late' | 'delivered'
export type VehicleStatus = 'on-plan' | 'off-plan' | 'maintenance'

export interface Shipment {
  id: string
  reference: string
  customer: string
  origin: string
  destination: string
  lane: string
  status: ShipmentStatus
  promised: string // ISO date-time
  eta: string
  weightKg: number
  pallets: number
  driverId: string | null
  vehicleId: string | null
  updatedAt: string
}
export interface Vehicle { id: string; plate: string; type: 'van' | 'rigid' | 'artic'; status: VehicleStatus; lastSeen: string }
export interface Driver { id: string; name: string; phone: string; onDuty: boolean }

/** The clock every render uses: 31 October 2026, 08:00 UTC. */
export const NOW = '2026-10-31T08:00:00.000Z'
export const nowMs = () => Date.parse(NOW)

export const HUBS = ['Bilbao', 'Zaragoza', 'Valencia', 'Madrid', 'Porto', 'Toulouse'] as const
export const CUSTOMERS = ['Norte Fresh', 'Ibérica Textil', 'Atlántico Pesca', 'Mobiliario Vega', 'Papelera del Ebro', 'Cerámicas Alba', 'Bodegas Arlanza', 'Química Segre', 'Farmalogic', 'Vidrios Castro'] as const

/** mulberry32: small, deterministic, good enough for fixtures. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)]!
const iso = (ms: number) => new Date(ms).toISOString()
const HOUR = 3600_000

export interface Dataset { shipments: Shipment[]; vehicles: Vehicle[]; drivers: Driver[] }

export function generateDataset(seed = 7, counts = { shipments: 400, vehicles: 40, drivers: 60 }): Dataset {
  const rand = seeded(seed)
  const now = nowMs()
  const drivers: Driver[] = Array.from({ length: counts.drivers }, (_, i) => ({ id: `d-${String(i + 1).padStart(3, '0')}`, name: `${pick(rand, FIRST)} ${pick(rand, LAST)}`, phone: `+34 6${String(Math.floor(rand() * 1e8)).padStart(8, '0')}`, onDuty: rand() < 0.7 }))
  const vehicles: Vehicle[] = Array.from({ length: counts.vehicles }, (_, i) => {
    const r = rand()
    return { id: `v-${String(i + 1).padStart(3, '0')}`, plate: `${String(1000 + Math.floor(rand() * 9000))} ${pick(rand, ['KLM', 'LPR', 'MNT', 'JRS'])}`, type: pick(rand, ['van', 'rigid', 'artic'] as const), status: r < 0.8 ? 'on-plan' : r < 0.93 ? 'off-plan' : 'maintenance', lastSeen: iso(now - rand() * 6 * HOUR) }
  })
  const shipments: Shipment[] = Array.from({ length: counts.shipments }, (_, i) => {
    const origin = pick(rand, HUBS)
    let destination = pick(rand, HUBS)
    while (destination === origin) destination = pick(rand, HUBS)
    const promisedOffset = (rand() * 96 - 24) * HOUR // from 24 h ago to 72 h ahead
    const promised = now + promisedOffset
    const r = rand()
    let status: ShipmentStatus
    if (promisedOffset < -2 * HOUR) status = r < 0.82 ? 'delivered' : 'late'
    else if (promisedOffset < 6 * HOUR) status = r < 0.5 ? 'in-transit' : r < 0.75 ? 'at-risk' : r < 0.9 ? 'late' : 'delivered'
    else status = r < 0.55 ? 'planned' : r < 0.9 ? 'in-transit' : 'at-risk'
    const slip = status === 'late' ? (1 + rand() * 6) * HOUR : status === 'at-risk' ? (0.5 + rand() * 2) * HOUR : -rand() * HOUR
    const assigned = status !== 'planned' || rand() < 0.6
    const updated = now - rand() * 3 * HOUR
    return {
      id: `s-${String(i + 1).padStart(4, '0')}`,
      reference: `ATL-${26000 + i}`,
      customer: pick(rand, CUSTOMERS),
      origin,
      destination,
      lane: `${origin.slice(0, 3).toUpperCase()}-${destination.slice(0, 3).toUpperCase()}`,
      status,
      promised: iso(promised),
      eta: iso(promised + slip),
      weightKg: Math.round(200 + rand() * 22000),
      pallets: 1 + Math.floor(rand() * 33),
      driverId: assigned ? pick(rand, drivers).id : null,
      vehicleId: assigned ? pick(rand, vehicles).id : null,
      updatedAt: iso(updated),
    }
  })
  return { shipments, vehicles, drivers }
}

const FIRST = ['Aitor', 'Lucía', 'Marc', 'Nerea', 'Pablo', 'Irene', 'Hugo', 'Carla', 'Iker', 'Sara', 'Jon', 'Alba', 'Mateo', 'Vera', 'Unai', 'Noa'] as const
const LAST = ['Etxeberria', 'García', 'Puig', 'Lasa', 'Moreno', 'Ferrer', 'Ibarra', 'Navarro', 'Soler', 'Zubiri', 'Castro', 'Ortega'] as const

/** The dataset every page shares (same seed in both apps). */
export const DATASET: Dataset = generateDataset()

// ---- KPIs and series for the dashboard ----

export interface Kpi { id: string; label: string; value: number; unit?: string; delta: number; deltaLabel: string; tone: 'danger' | 'warning' | 'info' | 'success' | 'neutral'; href: string }

export function computeKpis(d: Dataset): Kpi[] {
  const late = d.shipments.filter((s) => s.status === 'late').length
  const atRisk = d.shipments.filter((s) => s.status === 'at-risk').length
  const unassigned = d.shipments.filter((s) => s.status !== 'delivered' && (!s.driverId || !s.vehicleId)).length
  const offPlan = d.vehicles.filter((v) => v.status === 'off-plan').length
  const closed = d.shipments.filter((s) => s.status === 'delivered' || s.status === 'late')
  const onTime = closed.length ? Math.round((100 * closed.filter((s) => s.status === 'delivered').length) / closed.length) : 100
  return [
    { id: 'late', label: 'Late shipments', value: late, delta: 3, deltaLabel: 'vs yesterday', tone: 'danger', href: '/app/shipments?status=late' },
    { id: 'at-risk', label: 'At risk', value: atRisk, delta: -2, deltaLabel: 'vs yesterday', tone: 'warning', href: '/app/shipments?status=at-risk' },
    { id: 'unassigned', label: 'Unassigned loads', value: unassigned, delta: 1, deltaLabel: 'vs yesterday', tone: 'info', href: '/app/shipments?assigned=no' },
    { id: 'off-plan', label: 'Vehicles off plan', value: offPlan, delta: 0, deltaLabel: 'vs yesterday', tone: 'neutral', href: '/app/fleet' },
    { id: 'on-time', label: 'On-time rate, 7 days', value: onTime, unit: '%', delta: 1.4, deltaLabel: 'pts vs last week', tone: 'success', href: '/app/shipments?status=delivered' },
  ]
}

export interface SeriesPoint { day: string; onTime: number; late: number; volume: number }
/** Fourteen days of deliveries, deterministic. */
export function deliverySeries(seed = 11): SeriesPoint[] {
  const rand = seeded(seed)
  const start = nowMs() - 13 * 24 * HOUR
  return Array.from({ length: 14 }, (_, i) => {
    const volume = 70 + Math.round(rand() * 40)
    const late = Math.round(volume * (0.04 + rand() * 0.08))
    return { day: iso(start + i * 24 * HOUR).slice(0, 10), onTime: volume - late, late, volume }
  })
}

export interface LaneLoad { lane: string; shipments: number; weightT: number }
export function laneLoads(d: Dataset, top = 6): LaneLoad[] {
  const by = new Map<string, LaneLoad>()
  for (const s of d.shipments) {
    if (s.status === 'delivered') continue
    const entry = by.get(s.lane) ?? { lane: s.lane, shipments: 0, weightT: 0 }
    entry.shipments++
    entry.weightT += s.weightKg / 1000
    by.set(s.lane, entry)
  }
  return [...by.values()].map((l) => ({ ...l, weightT: Math.round(l.weightT) })).sort((a, b) => b.shipments - a.shipments).slice(0, top)
}

// ---- formatting (locale fixed for determinism) ----

export const fmtInt = (n: number) => new Intl.NumberFormat('en-GB').format(n)
export const fmtDateTime = (isoString: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(isoString))
export const fmtDate = (isoString: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(isoString))
/** Relative to the fixed clock: "in 3 h", "2 h ago". */
export function fmtRelative(isoString: string): string {
  const diff = Date.parse(isoString) - nowMs()
  const h = Math.round(Math.abs(diff) / HOUR)
  if (h === 0) return 'now'
  return diff > 0 ? `in ${h} h` : `${h} h ago`
}
export const STATUS_LABEL: Record<ShipmentStatus, string> = { planned: 'Planned', 'in-transit': 'In transit', 'at-risk': 'At risk', late: 'Late', delivered: 'Delivered' }
/** Status is shown with a word and a shape as well as a colour (contract R4). */
export const STATUS_TONE: Record<ShipmentStatus, 'neutral' | 'info' | 'warning' | 'danger' | 'success'> = { planned: 'neutral', 'in-transit': 'info', 'at-risk': 'warning', late: 'danger', delivered: 'success' }
export const STATUS_GLYPH: Record<ShipmentStatus, string> = { planned: '○', 'in-transit': '→', 'at-risk': '◐', late: '▲', delivered: '●' }
