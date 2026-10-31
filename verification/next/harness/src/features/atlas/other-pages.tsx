'use client'
// New shipment, fleet and settings: the three smaller screens of the enterprise app in Next.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DATASET, fmtRelative, type VehicleStatus } from '@/lib/ui/saas/data'
import type { Preferences } from '@/lib/ui/saas/forms'
import { PAGE_SIZES } from '@/lib/ui/saas/table-state'
import { ShipmentForm } from './shipment-form'
import { usePreferences, useShipments } from './shipments-provider'

export function NewShipmentPage() {
  const router = useRouter()
  const { mode, reload } = useShipments()
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-tight">New shipment</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted-foreground">Plan a load for a customer. Fields marked with an asterisk are required; the reference must be unique.</p>
      <ShipmentForm mode={mode} onCreated={(reference) => { reload(); router.push(`/app/shipments?q=${encodeURIComponent(reference)}&created=${encodeURIComponent(reference)}`) }} />
    </div>
  )
}

const TONE: Record<VehicleStatus, { className: string; label: string; glyph: string }> = {
  'on-plan': { className: 'bg-dc-success/15 text-dc-success', label: 'On plan', glyph: '●' },
  'off-plan': { className: 'bg-dc-warning/15 text-dc-warning', label: 'Off plan', glyph: '▲' },
  maintenance: { className: 'bg-muted text-foreground', label: 'Maintenance', glyph: '○' },
}

export function FleetPage() {
  const [filter, setFilter] = useState<'all' | VehicleStatus>('all')
  const vehicles = DATASET.vehicles.filter((v) => filter === 'all' || v.status === filter)
  return (
    <div className="p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Fleet</h1>
        <Select value={filter} onValueChange={(v) => setFilter(v as 'all' | VehicleStatus)}>
          <SelectTrigger className="w-44" aria-label="Filter vehicles by status" data-fleet-filter><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All vehicles</SelectItem><SelectItem value="on-plan">On plan</SelectItem><SelectItem value="off-plan">Off plan</SelectItem><SelectItem value="maintenance">In maintenance</SelectItem></SelectContent>
        </Select>
      </div>
      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">{vehicles.length} of {DATASET.vehicles.length} vehicles</p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-vehicles>
        {vehicles.map((v) => (
          <li key={v.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-mono font-medium">{v.plate}</p><p className="text-sm capitalize text-muted-foreground">{v.type} · {v.id}</p></div>
              <Badge variant="outline" className={`border-transparent ${TONE[v.status].className}`}><span aria-hidden="true" className="mr-1">{TONE[v.status].glyph}</span>{TONE[v.status].label}</Badge>
            </div>
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">Last seen {fmtRelative(v.lastSeen)}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

const COLUMNS = [['reference', 'Reference'], ['customer', 'Customer'], ['lane', 'Lane'], ['status', 'Status'], ['promised', 'Promised'], ['eta', 'ETA'], ['weightKg', 'Weight'], ['pallets', 'Pallets'], ['updatedAt', 'Updated']] as const

export function SettingsPage() {
  const { prefs, update } = usePreferences()
  const [saved, setSaved] = useState<string | null>(null)
  function save(patch: Partial<Preferences>) {
    update(patch)
    setSaved(`Saved · ${new Date().toLocaleTimeString('en-GB')}`)
    toast.success('Preference saved', { description: 'Applied on this device.' })
  }
  return (
    <div className="max-w-2xl space-y-8 p-4 md:p-6">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="text-sm text-muted-foreground" aria-live="polite" data-saved>{saved ?? 'Changes save as you make them, on this device.'}</p>
      <FieldSet>
        <FieldLegend>Density</FieldLegend>
        <FieldDescription>Row height and padding; nothing else changes.</FieldDescription>
        <RadioGroup value={prefs.density} onValueChange={(v) => save({ density: v as Preferences['density'] })} aria-label="Density" data-pref="density">
          <div className="flex items-center gap-2"><RadioGroupItem value="compact" id="density-compact" /><Label htmlFor="density-compact">Compact (32px rows, the default for dispatch)</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="comfortable" id="density-comfortable" /><Label htmlFor="density-comfortable">Comfortable (40px rows)</Label></div>
        </RadioGroup>
      </FieldSet>
      <Field>
        <FieldLabel htmlFor="pref-theme">Theme</FieldLabel>
        <Select value={prefs.theme} onValueChange={(v) => save({ theme: v as Preferences['theme'] })}>
          <SelectTrigger id="pref-theme" className="w-60" data-pref="theme"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="system">Follow the system</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
        </Select>
      </Field>
      <FieldSet>
        <FieldLegend>Shipment table columns</FieldLegend>
        <FieldDescription>At least reference and status stay visible.</FieldDescription>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Shipment table columns" data-pref="columns">
          {COLUMNS.map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox id={`col-${key}`} checked={prefs.columns.includes(key)} disabled={key === 'reference' || key === 'status'} onCheckedChange={(c) => save({ columns: c === true ? COLUMNS.map(([k]) => k).filter((k) => k === key || prefs.columns.includes(k)) : prefs.columns.filter((k) => k !== key) })} />
              <Label htmlFor={`col-${key}`}>{label}</Label>
            </div>
          ))}
        </div>
      </FieldSet>
      <Field>
        <FieldLabel htmlFor="pref-page-size">Rows per page</FieldLabel>
        <Select value={String(prefs.pageSize)} onValueChange={(v) => save({ pageSize: Number(v) })}>
          <SelectTrigger id="pref-page-size" className="w-60" data-pref="pageSize"><SelectValue /></SelectTrigger>
          <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} rows per page</SelectItem>)}</SelectContent>
        </Select>
      </Field>
    </div>
  )
}
