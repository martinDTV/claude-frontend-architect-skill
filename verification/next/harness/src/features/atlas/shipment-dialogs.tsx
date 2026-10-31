'use client'
// The three overlays of the table: details in a sheet, assign-a-driver in a dialog with validation, a pending state
// and a server error mapped to the field (?api=fail makes the api refuse), and the cancel confirmation that names the
// shipment and the consequence. Focus goes back to the row's actions button on close (the menu that opened the overlay
// is gone by then, so the library's default would land on the body).
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DATASET, fmtDateTime, fmtInt, fmtRelative, type Shipment } from '@/lib/ui/saas/data'
import type { ApiError, ApiMode } from '@/lib/ui/saas/forms'
import { shipmentsApi } from './shipments-provider'
import { StatusBadge } from './ui'

const ON_DUTY = DATASET.drivers.filter((d) => d.onDuty)
type Overlay = { open: boolean; shipment: Shipment | null; returnTo: HTMLElement | null }
const restore = (el: HTMLElement | null) => (e: Event) => { e.preventDefault(); el?.focus() }

export function ShipmentDetails({ overlay, onOpenChange }: { overlay: Overlay; onOpenChange: (o: boolean) => void }) {
  const s = overlay.shipment
  const driver = DATASET.drivers.find((d) => d.id === s?.driverId)
  const vehicle = DATASET.vehicles.find((v) => v.id === s?.vehicleId)
  return (
    <Sheet open={overlay.open} onOpenChange={onOpenChange}>
      <SheetContent side="right" onCloseAutoFocus={restore(overlay.returnTo)}>
        <SheetHeader>
          <SheetTitle className="font-mono">{s?.reference ?? 'Shipment'}</SheetTitle>
          <SheetDescription>{s ? `${s.customer} · ${s.origin} → ${s.destination}` : ''}</SheetDescription>
        </SheetHeader>
        {s && (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 px-4 text-sm" data-shipment-details>
            <dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={s.status} /></dd>
            <dt className="text-muted-foreground">Promised</dt><dd className="tabular-nums">{fmtDateTime(s.promised)} UTC</dd>
            <dt className="text-muted-foreground">ETA</dt><dd className="tabular-nums">{fmtDateTime(s.eta)} UTC · {fmtRelative(s.eta)}</dd>
            <dt className="text-muted-foreground">Load</dt><dd className="tabular-nums">{fmtInt(s.weightKg)} kg · {s.pallets} pallets</dd>
            <dt className="text-muted-foreground">Driver</dt><dd>{driver ? `${driver.name} · ${driver.phone}` : 'Unassigned'}</dd>
            <dt className="text-muted-foreground">Vehicle</dt><dd>{vehicle ? `${vehicle.plate} · ${vehicle.type}` : 'Unassigned'}</dd>
            <dt className="text-muted-foreground">Updated</dt><dd className="tabular-nums">{fmtRelative(s.updatedAt)}</dd>
          </dl>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function AssignDriverDialog({ overlay, mode, onOpenChange, onAssigned }: { overlay: Overlay; mode: ApiMode; onOpenChange: (o: boolean) => void; onAssigned: (shipmentId: string, driverId: string) => void }) {
  const s = overlay.shipment
  const [driverId, setDriverId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (overlay.open) { setDriverId(s?.driverId ?? ''); setError(null) } }, [overlay.open, s])
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!s) return
    if (!driverId) { setError('Choose a driver who is on duty.'); return }
    setBusy(true)
    setError(null)
    try {
      await shipmentsApi.assign(s.id, driverId, { mode: mode === 'fail' ? 'fail' : 'ok' })
      onAssigned(s.id, driverId)
      toast.success(`Driver assigned to ${s.reference}`)
      onOpenChange(false)
    } catch (err) {
      setError((err as ApiError).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={overlay.open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent onCloseAutoFocus={restore(overlay.returnTo)}>
        <DialogHeader>
          <DialogTitle>{s ? `Assign a driver to ${s.reference}` : 'Assign a driver'}</DialogTitle>
          <DialogDescription>{s ? `${s.customer} · ${s.lane}` : ''}</DialogDescription>
        </DialogHeader>
        <form id="assign-form" className="space-y-4" noValidate onSubmit={submit}>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="assign-driver">Driver <span aria-hidden="true">*</span></FieldLabel>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger id="assign-driver" className="w-full" aria-invalid={error ? true : undefined} aria-describedby={error ? 'assign-driver-error' : 'assign-driver-help'} data-assign-driver>
                <SelectValue placeholder="Search by name" />
              </SelectTrigger>
              <SelectContent>
                {ON_DUTY.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.phone}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldDescription id="assign-driver-help">Only drivers on duty are listed.</FieldDescription>
            {error && <FieldError id="assign-driver-error">{error}</FieldError>}
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="assign-form" disabled={busy} aria-busy={busy} data-assign-submit>{busy ? 'Assigning…' : 'Assign'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CancelShipmentDialog({ overlay, onOpenChange, onConfirm }: { overlay: Overlay; onOpenChange: (o: boolean) => void; onConfirm: (s: Shipment) => void }) {
  const s = overlay.shipment
  return (
    <Dialog open={overlay.open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={restore(overlay.returnTo)}>
        <DialogHeader>
          <DialogTitle>Cancel this shipment?</DialogTitle>
          <DialogDescription>{s ? `${s.reference} for ${s.customer} will be removed from the plan and the customer and driver will be notified. This cannot be undone.` : ''}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Keep it</Button>
          <Button variant="destructive" data-confirm-cancel onClick={() => { if (s) onConfirm(s) }}>Cancel shipment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
