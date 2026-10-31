// The shared enterprise domain: deterministic data, table state as pure functions with a URL round trip, the
// shipment form schema and the preferences schema. Runs in the Vue project's Vitest; the apps compile the same files.
import { describe, expect, it } from 'vitest'
import { DATASET, computeKpis, deliverySeries, fmtRelative, generateDataset, laneLoads } from './data'
import { DEFAULT_TABLE_STATE, applyTableState, queryToState, stateToQuery, toggleSort } from './table-state'
import { EMPTY_SHIPMENT_FORM, apiModeFrom, createFakeApi, fieldErrors, preferencesSchema, readPreferences, shipmentFormSchema } from './forms'

describe('data', () => {
  it('is deterministic: the same seed gives the same rows, the clock is fixed', () => {
    const a = generateDataset(7)
    const b = generateDataset(7)
    expect(a.shipments.map((s) => s.id + s.status + s.eta)).toEqual(b.shipments.map((s) => s.id + s.status + s.eta))
    expect(generateDataset(8).shipments[0]!.customer === a.shipments[0]!.customer && generateDataset(8).shipments[1]!.eta === a.shipments[1]!.eta).toBe(false)
    expect(DATASET.shipments).toHaveLength(400)
    expect(DATASET.vehicles).toHaveLength(40)
    expect(new Set(DATASET.shipments.map((s) => s.reference)).size).toBe(400)
    for (const s of DATASET.shipments) expect(s.origin).not.toBe(s.destination)
  })
  it('computes the dashboard numbers from the rows and names status without colour', () => {
    const kpis = computeKpis(DATASET)
    expect(kpis.map((k) => k.id)).toEqual(['late', 'at-risk', 'unassigned', 'off-plan', 'on-time'])
    expect(kpis.find((k) => k.id === 'late')!.value).toBe(DATASET.shipments.filter((s) => s.status === 'late').length)
    expect(kpis.every((k) => k.href.startsWith('/app/'))).toBe(true)
    expect(deliverySeries()).toHaveLength(14)
    expect(deliverySeries()[0]!.day < deliverySeries()[13]!.day).toBe(true)
    expect(laneLoads(DATASET).length).toBeLessThanOrEqual(6)
    expect(fmtRelative('2026-10-31T11:00:00.000Z')).toBe('in 3 h')
    expect(fmtRelative('2026-10-31T06:00:00.000Z')).toBe('2 h ago')
  })
})

describe('table state', () => {
  it('filters, searches, sorts with a stable tie-break and paginates', () => {
    const late = applyTableState(DATASET.shipments, { ...DEFAULT_TABLE_STATE, status: ['late'] })
    expect(late.rows.every((r) => r.status === 'late')).toBe(true)
    expect(late.total).toBe(DATASET.shipments.filter((s) => s.status === 'late').length)
    const search = applyTableState(DATASET.shipments, { ...DEFAULT_TABLE_STATE, search: 'norte' })
    expect(search.rows.every((r) => r.customer === 'Norte Fresh')).toBe(true)
    const byWeight = applyTableState(DATASET.shipments, { ...DEFAULT_TABLE_STATE, sort: { key: 'weightKg', dir: 'desc' }, pageSize: 10 })
    expect(byWeight.rows).toHaveLength(10)
    expect(byWeight.rows[0]!.weightKg).toBeGreaterThanOrEqual(byWeight.rows[9]!.weightKg)
    expect(byWeight.pages).toBe(40)
    const last = applyTableState(DATASET.shipments, { ...DEFAULT_TABLE_STATE, page: 99 })
    expect(last.page).toBe(16)
    expect(last.to).toBe(400)
    const unassigned = applyTableState(DATASET.shipments, { ...DEFAULT_TABLE_STATE, assigned: 'no' })
    expect(unassigned.rows.every((r) => !r.driverId || !r.vehicleId)).toBe(true)
    expect(applyTableState([], DEFAULT_TABLE_STATE)).toMatchObject({ total: 0, pages: 1, from: 0, to: 0 })
  })
  it('round-trips through the query string and ignores junk', () => {
    const state = { ...DEFAULT_TABLE_STATE, sort: { key: 'eta' as const, dir: 'desc' as const }, status: ['late' as const, 'at-risk' as const], lane: 'BIL-MAD', assigned: 'no' as const, search: 'vega', page: 3, pageSize: 50 }
    const q = stateToQuery(state)
    expect(q).toEqual({ sort: 'eta:desc', status: 'late,at-risk', lane: 'BIL-MAD', assigned: 'no', q: 'vega', page: '3', size: '50' })
    expect(queryToState(q)).toEqual(state)
    expect(stateToQuery(DEFAULT_TABLE_STATE)).toEqual({})
    expect(queryToState({ sort: 'nope:up', status: 'late,bogus', page: '-2', size: '7' })).toEqual({ ...DEFAULT_TABLE_STATE, status: ['late'] })
    expect(toggleSort(toggleSort(DEFAULT_TABLE_STATE, 'customer'), 'customer').sort).toEqual({ key: 'customer', dir: 'desc' })
  })
})

describe('forms, preferences and the fake api', () => {
  it('validates the shipment form with human messages and the cross-field rule', () => {
    expect(Object.keys(fieldErrors(EMPTY_SHIPMENT_FORM))).toEqual(expect.arrayContaining(['reference', 'customer', 'promised', 'weightKg', 'pallets']))
    const ok = shipmentFormSchema.safeParse({ reference: 'ATL-26500', customer: 'Norte Fresh', origin: 'Bilbao', destination: 'Madrid', promised: '2026-11-02T10:00', weightKg: '1200', pallets: '4' })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data.weightKg).toBe(1200)
    const same = fieldErrors({ reference: 'ATL-26500', customer: 'Norte Fresh', origin: 'Bilbao', destination: 'Bilbao', promised: '2026-11-02T10:00', weightKg: 1200, pallets: 4 })
    expect(same.destination).toMatch(/must differ/)
    const past = fieldErrors({ reference: 'ATL-26500', customer: 'Norte Fresh', origin: 'Bilbao', destination: 'Madrid', promised: '2026-10-01T10:00', weightKg: 30000, pallets: 40 })
    expect(past.promised).toMatch(/in the past/)
    expect(past.weightKg).toMatch(/special permit/)
    expect(past.pallets).toMatch(/33/)
  })
  it('reads preferences defensively and keeps the version', () => {
    expect(readPreferences(null).density).toBe('compact')
    expect(readPreferences({ getItem: () => '{"version":1,"density":"comfortable","theme":"dark"}' }).theme).toBe('dark')
    expect(readPreferences({ getItem: () => '{"version":2,"density":"loud"}' })).toEqual(preferencesSchema.parse({ version: 1 }))
    expect(readPreferences({ getItem: () => 'not json' }).pageSize).toBe(25)
  })
  it('drives the loading, empty and error states from a mode and reports typed errors', async () => {
    const api = createFakeApi(DATASET)
    expect(apiModeFrom('?api=fail')).toBe('fail')
    expect(apiModeFrom('?api=weird')).toBe('ok')
    await expect(api.shipments({ mode: 'empty', latencyMs: 1 })).resolves.toEqual([])
    await expect(api.shipments({ mode: 'fail', latencyMs: 1 })).rejects.toMatchObject({ name: 'ApiError', status: 503, requestId: 'req_7f3a2c' })
    const rows = await api.shipments({ latencyMs: 1 })
    expect(rows).toHaveLength(400)
    const created = await api.create({ reference: 'ATL-26999', customer: 'Vidrios Castro', origin: 'Porto', destination: 'Valencia', promised: '2026-11-03T09:00', weightKg: 800, pallets: 2, driverId: null, notes: '', priority: false }, { latencyMs: 1 })
    expect(created.lane).toBe('POR-VAL')
    expect((await api.shipments({ latencyMs: 1 }))[0]!.id).toBe(created.id)
    const controller = new AbortController()
    const pending = api.shipments({ latencyMs: 50, signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
