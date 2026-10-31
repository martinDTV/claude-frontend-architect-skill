'use client'
// The new-shipment form (forms.md): the shared Zod schema drives validation, labels always visible, helper text
// before errors, validation on blur and submit, an error summary that moves focus, a pending state on the submit, a
// server error (?api=fail: duplicate reference) mapped to its field. The promised slot is a native date input (typed
// or picked from the calendar popover) and a native time input, composed into the ISO value.
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { CalendarIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DATASET, HUBS, NOW } from '@/lib/ui/saas/data'
import { fieldErrors, shipmentFormSchema, type ApiError, type ApiMode } from '@/lib/ui/saas/forms'
import { shipmentsApi } from './shipments-provider'

type Hub = (typeof HUBS)[number]
interface Values { reference: string; customer: string; origin: Hub; destination: Hub; date: string; time: string; weightKg: string; pallets: string; driverId: string; notes: string; priority: boolean }
const EMPTY: Values = { reference: '', customer: '', origin: 'Bilbao', destination: 'Madrid', date: '', time: '09:00', weightKg: '', pallets: '', driverId: '', notes: '', priority: false }
const ORDER = ['reference', 'customer', 'origin', 'destination', 'promised', 'driverId', 'weightKg', 'pallets', 'notes', 'priority']
const NONE = '__none__'
const ON_DUTY = DATASET.drivers.filter((d) => d.onDuty)
const MIN_DATE = NOW.slice(0, 10)
const toInput = (v: Values) => ({ ...v, promised: v.date ? `${v.date}T${v.time || '09:00'}` : '', driverId: v.driverId || null })
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function ShipmentForm({ mode, onCreated }: { mode: ApiMode; onCreated: (reference: string) => Promise<void> | void }) {
  const [values, setValues] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const summary = useRef<HTMLDivElement>(null)
  // the summary takes focus in the commit that renders it (a layout effect, not a timer): the reader hears it at once
  const [focusTick, setFocusTick] = useState(0)
  useLayoutEffect(() => { if (focusTick) summary.current?.focus() }, [focusTick])
  const set = <K extends keyof Values>(key: K, v: Values[K]) => {
    const next = { ...values, [key]: v }
    setValues(next)
    if (submitted || touched[key === 'date' || key === 'time' ? 'promised' : key]) setErrors(fieldErrors(toInput(next)))
  }
  const blur = (key: string) => { setTouched((t) => ({ ...t, [key]: true })); setErrors(fieldErrors(toInput(values))) }
  const shown = (key: string) => (submitted || touched[key]) && errors[key] ? errors[key] : undefined
  const invalid = (key: string) => (shown(key) ? true : undefined)
  const describedBy = (key: string) => (shown(key) ? `field-${key}-error field-${key}-help` : `field-${key}-help`)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setServerError(null)
    const input = toInput(values)
    const errs = fieldErrors(input)
    setErrors(errs)
    if (Object.keys(errs).length) { setFocusTick((n) => n + 1); return }
    setBusy(true)
    try {
      const created = await shipmentsApi.create(shipmentFormSchema.parse(input), { mode: mode === 'fail' ? 'fail' : 'ok' })
      toast.success(`Shipment ${created.reference} planned`, { description: `${created.lane}, promised ${created.promised.slice(0, 16).replace('T', ' ')} UTC.` })
      await onCreated(created.reference)
    } catch (err) {
      const apiError = err as ApiError
      setServerError(apiError.message)
      // a conflict names the field: the reference already exists
      if (apiError.status === 409) setErrors((prev) => ({ ...prev, reference: apiError.message }))
      setFocusTick((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }
  const errorList = ORDER.filter((k) => errors[k]).map((k) => ({ name: k, message: errors[k] }))
  const showSummary = serverError || (submitted && errorList.length > 0)

  return (
    <form className="max-w-2xl space-y-6" noValidate onSubmit={onSubmit} data-shipment-form>
      {showSummary && (
        <div ref={summary} tabIndex={-1} role="alert" className="rounded-md border border-dc-danger/40 bg-dc-danger/5 p-3 text-sm" data-error-summary>
          <p className="font-medium text-dc-danger">{serverError ? 'The shipment was not saved.' : `Check ${errorList.length} field${errorList.length === 1 ? '' : 's'} before saving.`}</p>
          {serverError ? <p className="mt-1">{serverError}</p> : <ul className="mt-1 list-disc pl-5">{errorList.map((e) => <li key={e.name}><a href={`#field-${e.name}`} className="underline">{e.message}</a></li>)}</ul>}
        </div>
      )}
      <FieldSet>
        <FieldLegend>Order</FieldLegend>
        <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={invalid('reference')}>
            <FieldLabel htmlFor="field-reference">Reference <span aria-hidden="true">*</span></FieldLabel>
            <Input id="field-reference" value={values.reference} onChange={(e) => set('reference', e.target.value)} onBlur={() => blur('reference')} placeholder="ATL-26501" className="font-mono" autoComplete="off" required aria-required="true" aria-invalid={invalid('reference')} aria-describedby={describedBy('reference')} />
            <FieldDescription id="field-reference-help">ATL followed by five digits, e.g. ATL-26501.</FieldDescription>
            {shown('reference') && <FieldError id="field-reference-error">{shown('reference')}</FieldError>}
          </Field>
          <Field data-invalid={invalid('customer')}>
            <FieldLabel htmlFor="field-customer">Customer <span aria-hidden="true">*</span></FieldLabel>
            <Input id="field-customer" value={values.customer} onChange={(e) => set('customer', e.target.value)} onBlur={() => blur('customer')} autoComplete="organization" required aria-required="true" aria-invalid={invalid('customer')} aria-describedby={describedBy('customer')} />
            <FieldDescription id="field-customer-help">The customer as it appears on the order.</FieldDescription>
            {shown('customer') && <FieldError id="field-customer-error">{shown('customer')}</FieldError>}
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Route</FieldLegend>
        <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={invalid('origin')}>
            <FieldLabel htmlFor="field-origin">Origin hub <span aria-hidden="true">*</span></FieldLabel>
            <Select value={values.origin} onValueChange={(v) => set('origin', v as Hub)}>
              <SelectTrigger id="field-origin" className="w-full min-w-0" aria-invalid={invalid('origin')}><SelectValue /></SelectTrigger>
              <SelectContent>{HUBS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
            </Select>
            {shown('origin') && <FieldError id="field-origin-error">{shown('origin')}</FieldError>}
          </Field>
          <Field data-invalid={invalid('destination')}>
            <FieldLabel htmlFor="field-destination">Destination hub <span aria-hidden="true">*</span></FieldLabel>
            <Select value={values.destination} onValueChange={(v) => set('destination', v as Hub)}>
              <SelectTrigger id="field-destination" className="w-full min-w-0" aria-invalid={invalid('destination')} aria-describedby={describedBy('destination')}><SelectValue /></SelectTrigger>
              <SelectContent>{HUBS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
            </Select>
            <FieldDescription id="field-destination-help">Must differ from the origin.</FieldDescription>
            {shown('destination') && <FieldError id="field-destination-error">{shown('destination')}</FieldError>}
          </Field>
          <Field data-invalid={invalid('promised')}>
            <FieldLabel htmlFor="field-promised">Promised date <span aria-hidden="true">*</span></FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <Input id="field-promised" type="date" min={MIN_DATE} value={values.date} onChange={(e) => set('date', e.target.value)} onBlur={() => blur('promised')} className="w-44 max-w-full" aria-label="Promised date" required aria-required="true" aria-invalid={invalid('promised')} aria-describedby={describedBy('promised')} />
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild><Button type="button" variant="outline" size="icon" aria-label="Pick the promised date from a calendar"><CalendarIcon aria-hidden="true" /></Button></PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={values.date ? new Date(`${values.date}T00:00`) : undefined} defaultMonth={new Date(`${MIN_DATE}T00:00`)} disabled={{ before: new Date(`${MIN_DATE}T00:00`) }} onSelect={(d) => { if (d) set('date', isoDate(d)); setCalendarOpen(false) }} />
                </PopoverContent>
              </Popover>
              <Input type="time" value={values.time} onChange={(e) => set('time', e.target.value)} onBlur={() => blur('promised')} className="w-32" aria-label="Promised time" />
            </div>
            <FieldDescription id="field-promised-help">The slot the customer was given, UTC.</FieldDescription>
            {shown('promised') && <FieldError id="field-promised-error">{shown('promised')}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="field-driverId">Driver</FieldLabel>
            <Select value={values.driverId || NONE} onValueChange={(v) => set('driverId', v === NONE ? '' : v)}>
              <SelectTrigger id="field-driverId" className="w-full min-w-0" aria-describedby="field-driverId-help"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Unassigned for now</SelectItem>{ON_DUTY.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
            <FieldDescription id="field-driverId-help">Can be assigned later from the table.</FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Load</FieldLegend>
        <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={invalid('weightKg')}>
            <FieldLabel htmlFor="field-weightKg">Weight <span aria-hidden="true">*</span></FieldLabel>
            <div className="relative">
              <Input id="field-weightKg" type="number" inputMode="numeric" min={1} max={24000} value={values.weightKg} onChange={(e) => set('weightKg', e.target.value)} onBlur={() => blur('weightKg')} className="pr-10" required aria-required="true" aria-invalid={invalid('weightKg')} aria-describedby={describedBy('weightKg')} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" aria-hidden="true">kg</span>
            </div>
            <FieldDescription id="field-weightKg-help">Kilograms, whole numbers; above 24,000 kg the load needs a permit.</FieldDescription>
            {shown('weightKg') && <FieldError id="field-weightKg-error">{shown('weightKg')}</FieldError>}
          </Field>
          <Field data-invalid={invalid('pallets')}>
            <FieldLabel htmlFor="field-pallets">Pallets <span aria-hidden="true">*</span></FieldLabel>
            <Input id="field-pallets" type="number" inputMode="numeric" min={1} max={33} value={values.pallets} onChange={(e) => set('pallets', e.target.value)} onBlur={() => blur('pallets')} required aria-required="true" aria-invalid={invalid('pallets')} aria-describedby={describedBy('pallets')} />
            <FieldDescription id="field-pallets-help">An artic carries 33 at most.</FieldDescription>
            {shown('pallets') && <FieldError id="field-pallets-error">{shown('pallets')}</FieldError>}
          </Field>
          <Field className="sm:col-span-2" data-invalid={invalid('notes')}>
            <FieldLabel htmlFor="field-notes">Notes</FieldLabel>
            <Textarea id="field-notes" rows={3} maxLength={500} value={values.notes} onChange={(e) => set('notes', e.target.value)} onBlur={() => blur('notes')} aria-invalid={invalid('notes')} aria-describedby={describedBy('notes')} />
            <FieldDescription id="field-notes-help">{values.notes.length}/500</FieldDescription>
            {shown('notes') && <FieldError id="field-notes-error">{shown('notes')}</FieldError>}
          </Field>
          <Field orientation="horizontal" className="sm:col-span-2">
            <Checkbox id="field-priority" checked={values.priority} onCheckedChange={(c) => set('priority', c === true)} aria-describedby="field-priority-help" />
            <div className="grid gap-1">
              <FieldLabel htmlFor="field-priority">Priority load</FieldLabel>
              <FieldDescription id="field-priority-help">Dispatch plans it before standard loads of the same slot.</FieldDescription>
            </div>
          </Field>
        </FieldGroup>
      </FieldSet>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy} aria-busy={busy} data-submit>{busy ? 'Saving…' : 'Plan shipment'}</Button>
        <Button asChild variant="ghost"><Link href="/app/shipments" aria-disabled={busy}>Cancel</Link></Button>
        {busy && <span className="text-sm text-muted-foreground" role="status">Saving…</span>}
      </div>
    </form>
  )
}
