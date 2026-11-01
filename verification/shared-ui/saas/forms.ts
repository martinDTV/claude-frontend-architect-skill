/**
 * The "new shipment" form: one schema for both apps (forms.md: schema-first validation; errors as what happened and
 * what to do), plus the preferences schema and a simulated API with latency, failure and empty modes for the states.
 */
import { z } from 'zod'
import { HUBS, NOW, type Dataset, type Shipment } from './data'

export const shipmentFormSchema = z
  .object({
    reference: z.string().regex(/^ATL-\d{5}$/, 'Use the format ATL-26001 (ATL, a dash and five digits).'),
    customer: z.string().trim().min(2, 'Name the customer (at least two characters).').max(60, 'Keep the customer name under 60 characters.'),
    origin: z.enum(HUBS, { message: 'Choose an origin hub.' }),
    destination: z.enum(HUBS, { message: 'Choose a destination hub.' }),
    // an empty slot is one issue, not two: the first check aborts the second (Nuxt UI's form lists every issue it gets)
    promised: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Enter the promised date and time.', abort: true }).refine((v) => Date.parse(v) >= Date.parse(NOW), 'The promised time is in the past; pick a later slot.'),
    weightKg: z.coerce.number({ message: 'Weight in kilograms, numbers only.' }).int('Round the weight to whole kilograms.').min(1, 'Weight must be at least 1 kg.').max(24000, 'Above 24,000 kg the load needs a special permit; split it.'),
    pallets: z.coerce.number({ message: 'Pallets as a whole number.' }).int('Pallets as a whole number.').min(1, 'At least one pallet.').max(33, 'An artic carries 33 pallets at most.'),
    driverId: z.string().nullable().default(null),
    notes: z.string().max(500, 'Notes are limited to 500 characters.').default(''),
    priority: z.boolean().default(false),
  })
  .refine((v) => v.origin !== v.destination, { message: 'Origin and destination must differ.', path: ['destination'] })

export type ShipmentFormInput = z.input<typeof shipmentFormSchema>
export type ShipmentFormValues = z.output<typeof shipmentFormSchema>

export const EMPTY_SHIPMENT_FORM: ShipmentFormInput = { reference: '', customer: '', origin: 'Bilbao', destination: 'Madrid', promised: '', weightKg: '' as unknown as number, pallets: '' as unknown as number, driverId: null, notes: '', priority: false }

/** Field errors keyed by path, in the order of the form. */
export function fieldErrors(input: unknown): Record<string, string> {
  const result = shipmentFormSchema.safeParse(input)
  if (result.success) return {}
  const out: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'form'
    if (!out[key]) out[key] = issue.message
  }
  return out
}

// ---- preferences (persistence.md: versioned, nothing sensitive, cross-tab safe) ----

export const preferencesSchema = z.object({
  version: z.literal(1),
  density: z.enum(['compact', 'comfortable']).default('compact'),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  columns: z.array(z.string()).default(['reference', 'customer', 'lane', 'status', 'promised', 'eta', 'weightKg', 'pallets']),
  pageSize: z.number().int().default(25),
})
export type Preferences = z.output<typeof preferencesSchema>
export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({ version: 1 })
export const PREFERENCES_KEY = 'atlas.preferences.v1'

export function readPreferences(storage: Pick<Storage, 'getItem'> | null): Preferences {
  try {
    const raw = storage?.getItem(PREFERENCES_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = preferencesSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES
  } catch {
    return DEFAULT_PREFERENCES
  }
}
export function writePreferences(storage: Pick<Storage, 'setItem'> | null, prefs: Preferences): void {
  storage?.setItem(PREFERENCES_KEY, JSON.stringify(prefs))
}

// ---- the simulated API: latency, failure and empty modes drive the loading, error and empty states ----

export type ApiMode = 'ok' | 'empty' | 'fail' | 'slow'
export interface ApiOptions { mode?: ApiMode; latencyMs?: number; signal?: AbortSignal }

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly requestId: string) {
    super(message)
    this.name = 'ApiError'
  }
}

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')) }, { once: true })
})

/** Mode from the URL (`?api=fail|empty|slow`) so the states can be reached without code changes. */
export function apiModeFrom(search: string | URLSearchParams | undefined | null): ApiMode {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const mode = params?.get('api')
  return mode === 'fail' || mode === 'empty' || mode === 'slow' ? mode : 'ok'
}

export function createFakeApi(dataset: Dataset) {
  let created: Shipment[] = []
  return {
    async shipments(options: ApiOptions = {}): Promise<Shipment[]> {
      const mode = options.mode ?? 'ok'
      await wait(mode === 'slow' ? 2500 : options.latencyMs ?? 350, options.signal)
      if (mode === 'fail') throw new ApiError(503, 'The shipments service is not responding.', 'req_7f3a2c')
      if (mode === 'empty') return []
      return [...created, ...dataset.shipments]
    },
    async create(values: ShipmentFormValues, options: ApiOptions = {}): Promise<Shipment> {
      await wait(options.latencyMs ?? 500, options.signal)
      if (options.mode === 'fail') throw new ApiError(409, `A shipment with reference ${values.reference} already exists.`, 'req_1b9e40')
      const shipment: Shipment = {
        id: `s-new-${created.length + 1}`,
        reference: values.reference,
        customer: values.customer,
        origin: values.origin,
        destination: values.destination,
        lane: `${values.origin.slice(0, 3).toUpperCase()}-${values.destination.slice(0, 3).toUpperCase()}`,
        status: 'planned',
        promised: new Date(values.promised).toISOString(),
        eta: new Date(values.promised).toISOString(),
        weightKg: values.weightKg,
        pallets: values.pallets,
        driverId: values.driverId,
        vehicleId: null,
        updatedAt: NOW,
      }
      created = [shipment, ...created]
      return shipment
    },
    async assign(shipmentId: string, driverId: string, options: ApiOptions = {}): Promise<{ shipmentId: string; driverId: string }> {
      await wait(options.latencyMs ?? 300, options.signal)
      if (options.mode === 'fail') throw new ApiError(422, 'That driver is off duty; choose another.', 'req_c20d11')
      return { shipmentId, driverId }
    },
    reset() {
      created = []
    },
  }
}
export type FakeApi = ReturnType<typeof createFakeApi>
