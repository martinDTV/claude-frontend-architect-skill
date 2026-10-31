'use client'
// The shipments table (data-tables.md): sortable headers that announce their state, columns from the preferences,
// row actions in a menu, stacked cards under 768px. Sorting and paging are the page's state (the URL); this
// component renders and asks.
import { ArrowDown, ArrowUp, ArrowUpDown, Ellipsis } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmtDateTime, fmtInt, fmtRelative, type Shipment } from '@/lib/ui/saas/data'
import type { SortKey, TableState } from '@/lib/ui/saas/table-state'
import { StatusBadge } from './ui'

const LABELS: Record<string, string> = { reference: 'Reference', customer: 'Customer', lane: 'Lane', status: 'Status', promised: 'Promised', eta: 'ETA', weightKg: 'Weight', pallets: 'Pallets', updatedAt: 'Updated' }
const NUMERIC = new Set(['weightKg', 'pallets'])

export interface RowActions { onView: (s: Shipment, trigger: HTMLElement | null) => void; onAssign: (s: Shipment, trigger: HTMLElement | null) => void; onDeliver: (s: Shipment) => void; onCancel: (s: Shipment, trigger: HTMLElement | null) => void }

function cell(key: string, s: Shipment) {
  switch (key) {
    case 'reference': return <span className="font-mono text-sm">{s.reference}</span>
    case 'customer': return s.customer
    case 'lane': return <span className="font-mono text-xs text-muted-foreground">{s.lane}</span>
    case 'status': return <StatusBadge status={s.status} />
    case 'promised': return <span className="tabular-nums">{fmtDateTime(s.promised)}</span>
    case 'eta': return <span className="tabular-nums" title={fmtDateTime(s.eta)}>{fmtDateTime(s.eta)} · {fmtRelative(s.eta)}</span>
    case 'weightKg': return <span className="tabular-nums">{fmtInt(s.weightKg)} kg</span>
    case 'pallets': return <span className="tabular-nums">{s.pallets}</span>
    case 'updatedAt': return <span className="tabular-nums text-muted-foreground">{fmtRelative(s.updatedAt)}</span>
    default: return null
  }
}

export function ShipmentsTable({ rows, state, columns, onSort, actions }: { rows: Shipment[]; state: TableState; columns: string[]; onSort: (key: SortKey) => void; actions: RowActions }) {
  const visible = columns.filter((c) => c in LABELS)
  return (
    <div>
      {/* desktop and tablet: the table */}
      <div className="hidden rounded-md border border-border bg-card md:block">
        <Table aria-label="Shipments" data-shipments-table containerProps={{ tabIndex: 0, role: 'region', 'aria-label': 'Shipments, scrolls sideways when the columns do not fit' }}>
          <TableHeader>
            <TableRow>
              {visible.map((key) => {
                const active = state.sort.key === key
                const dir = active ? state.sort.dir : null
                const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown
                return (
                  <TableHead key={key} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'} className={`py-1.5 text-xs uppercase tracking-wide text-muted-foreground ${NUMERIC.has(key) ? 'text-right' : ''}`}>
                    <Button variant="ghost" size="sm" className="-mx-2 h-7 font-medium" data-sort={key} onClick={() => onSort(key as SortKey)}>
                      {LABELS[key]} <Icon aria-hidden="true" className="size-3.5" />
                    </Button>
                  </TableHead>
                )
              })}
              <TableHead className="w-10 text-right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                {visible.map((key) => <TableCell key={key} className={`py-1.5 [html[data-density=comfortable]_&]:py-3 ${NUMERIC.has(key) ? 'text-right' : ''}`}>{cell(key, s)}</TableCell>)}
                <TableCell className="w-10 py-1 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.reference}`} data-row-actions={s.reference}><Ellipsis aria-hidden="true" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onSelect={(e) => actions.onView(s, (e.currentTarget as HTMLElement).ownerDocument.querySelector(`[data-row-actions="${s.reference}"]`))}>View details</DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem disabled={s.status === 'delivered'} onSelect={(e) => actions.onAssign(s, (e.currentTarget as HTMLElement).ownerDocument.querySelector(`[data-row-actions="${s.reference}"]`))}>Assign driver</DropdownMenuItem>
                        <DropdownMenuItem disabled={s.status === 'delivered'} onSelect={() => actions.onDeliver(s)}>Mark delivered</DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem variant="destructive" disabled={s.status === 'delivered'} onSelect={(e) => actions.onCancel(s, (e.currentTarget as HTMLElement).ownerDocument.querySelector(`[data-row-actions="${s.reference}"]`))}>Cancel shipment</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {/* phones: the same rows as cards with the status and the identifier first */}
      <ul className="space-y-2 md:hidden" aria-label="Shipments" data-shipments-cards>
        {rows.map((s) => (
          <li key={s.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-mono text-sm font-medium">{s.reference}</p><p className="text-sm">{s.customer}</p></div>
              <StatusBadge status={s.status} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <dt>Lane</dt><dd className="font-mono text-foreground">{s.lane}</dd>
              <dt>ETA</dt><dd className="tabular-nums text-foreground">{fmtRelative(s.eta)}</dd>
              <dt>Load</dt><dd className="tabular-nums text-foreground">{fmtInt(s.weightKg)} kg · {s.pallets} pallets</dd>
            </dl>
            <div className="mt-2 flex gap-2">
              <Button size="xs" variant="outline" onClick={(e) => actions.onView(s, e.currentTarget)}>Details</Button>
              <Button size="xs" variant="outline" disabled={s.status === 'delivered'} onClick={(e) => actions.onAssign(s, e.currentTarget)}>Assign</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
