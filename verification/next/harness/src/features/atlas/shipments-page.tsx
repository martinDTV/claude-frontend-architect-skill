'use client'
// Shipments: the URL is the table state (sort, filters, search, page); the toolbar edits it, the table renders it,
// the row actions open a sheet, a dialog, or confirm with an undo toast; a destructive action names its consequence
// before it runs. Five states through the shared data region.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, FilterX, ListFilter, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATUS_LABEL, type Shipment, type ShipmentStatus } from '@/lib/ui/saas/data'
import { ACTIVE_FILTERS, DEFAULT_TABLE_STATE, PAGE_SIZES, applyTableState, queryToState, stateToQuery, toggleSort, type SortKey, type TableState } from '@/lib/ui/saas/table-state'
import { AssignDriverDialog, CancelShipmentDialog, ShipmentDetails } from './shipment-dialogs'
import { ShipmentsTable } from './shipments-table'
import { usePreferences, useShipments } from './shipments-provider'
import { StateBlock } from './ui'

const STATUSES = Object.keys(STATUS_LABEL) as ShipmentStatus[]
const ANY = '__any__'
type Overlay = { open: boolean; shipment: Shipment | null; returnTo: HTMLElement | null }
const CLOSED: Overlay = { open: false, shipment: null, returnTo: null }

function pageItems(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const items: (number | 'gap')[] = [1]
  if (page > 3) items.push('gap')
  for (let p = Math.max(2, page - 1); p <= Math.min(pages - 1, page + 1); p++) items.push(p)
  if (page < pages - 2) items.push('gap')
  items.push(pages)
  return items
}

export function ShipmentsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { rows, state: region, error, mode, reload } = useShipments()
  const { prefs } = usePreferences()
  const query = useMemo(() => Object.fromEntries(params.entries()), [params])
  const tableState = useMemo<TableState>(() => { const s = queryToState(query); if (!('size' in query) && prefs.pageSize !== DEFAULT_TABLE_STATE.pageSize) s.pageSize = prefs.pageSize; return s }, [query, prefs.pageSize])
  const hrefFor = (next: TableState) => { const q = new URLSearchParams({ ...(query.api ? { api: query.api } : {}), ...stateToQuery(next) }).toString(); return q ? `${pathname}?${q}` : pathname }
  const setState = (next: TableState) => router.replace(hrefFor(next), { scroll: false })
  // local edits (delivered, cancelled, assigned) on top of the loaded rows: optimistic, reversible
  const [overrides, setOverrides] = useState<Record<string, Partial<Shipment> | null>>({})
  const localRows = useMemo(() => rows.flatMap((s) => (overrides[s.id] === null ? [] : [{ ...s, ...(overrides[s.id] ?? {}) }])), [rows, overrides])
  const result = useMemo(() => applyTableState(localRows, tableState), [localRows, tableState])

  const [search, setSearch] = useState(tableState.search)
  useEffect(() => { setSearch(tableState.search) }, [tableState.search])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSearch = (v: string) => { setSearch(v); if (searchTimer.current) clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => { if (v !== tableState.search) setState({ ...tableState, search: v, page: 1 }) }, 250) }
  const lanes = useMemo(() => [...new Set(rows.map((s) => s.lane))].sort(), [rows])
  const activeFilters = ACTIVE_FILTERS(tableState)
  const clearFilters = () => setState({ ...DEFAULT_TABLE_STATE, sort: tableState.sort, pageSize: tableState.pageSize })
  const toggleStatus = (s: ShipmentStatus, on: boolean) => setState({ ...tableState, status: on ? [...tableState.status, s] : tableState.status.filter((x) => x !== s), page: 1 })

  const [details, setDetails] = useState<Overlay>(CLOSED)
  const [assign, setAssign] = useState<Overlay>(CLOSED)
  const [cancel, setCancel] = useState<Overlay>(CLOSED)
  const patch = (id: string, p: Partial<Shipment> | null) => setOverrides((o) => ({ ...o, [id]: p === null ? null : { ...(o[id] ?? {}), ...p } }))
  function deliver(s: Shipment) {
    const previous = overrides[s.id]
    patch(s.id, { status: 'delivered' })
    toast.success(`${s.reference} marked delivered`, { description: 'Undo within a few seconds if that was not the one.', action: { label: 'Undo', onClick: () => setOverrides((o) => ({ ...o, [s.id]: previous ?? {} })) } })
  }
  function confirmCancel(s: Shipment) {
    patch(s.id, null)
    toast(`${s.reference} cancelled`, { description: 'The customer and the driver are notified.' })
    setCancel(CLOSED)
  }
  const createdRef = query.created ?? ''
  const items = pageItems(result.page, result.pages)

  return (
    <div className="space-y-3 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Shipments</h1>
        <Button asChild><Link href="/app/shipments/new"><Plus aria-hidden="true" /> New shipment</Link></Button>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2" data-toolbar>
        <div className="relative w-full sm:w-64">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search reference, customer, lane" aria-label="Search shipments" className="pl-8" data-search />
        </div>
        <span id="filter-status-label" className="sr-only">Status</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button id="filter-status" variant="outline" className="w-full justify-between sm:w-44" aria-labelledby="filter-status-label filter-status" data-filter-status>
              <span className="flex items-center gap-2"><ListFilter aria-hidden="true" className="size-4" />{tableState.status.length ? tableState.status.map((s) => STATUS_LABEL[s]).join(', ') : 'Status'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUSES.map((s) => <DropdownMenuCheckboxItem key={s} checked={tableState.status.includes(s)} onCheckedChange={(on) => toggleStatus(s, on === true)} onSelect={(e) => e.preventDefault()}>{STATUS_LABEL[s]}</DropdownMenuCheckboxItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <Select value={tableState.lane ?? ANY} onValueChange={(v) => setState({ ...tableState, lane: v === ANY ? null : v, page: 1 })}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by lane" data-filter-lane><SelectValue placeholder="Lane" /></SelectTrigger>
          <SelectContent><SelectItem value={ANY}>All lanes</SelectItem>{lanes.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={tableState.assigned} onValueChange={(v) => setState({ ...tableState, assigned: v as TableState['assigned'], page: 1 })}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by assignment" data-filter-assigned><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Assigned or not</SelectItem><SelectItem value="yes">Assigned</SelectItem><SelectItem value="no">Unassigned</SelectItem></SelectContent>
        </Select>
        {activeFilters.length > 0 && <Button variant="ghost" data-clear-filters onClick={clearFilters}><X aria-hidden="true" /> Clear filters</Button>}
      </div>
      {createdRef && (
        <Alert data-created>
          <Check aria-hidden="true" />
          <AlertTitle>{createdRef} is planned</AlertTitle>
          <AlertDescription>It is at the top of the list, filtered by its reference. Clear the search to see everything.</AlertDescription>
        </Alert>
      )}
      <StateBlock state={region} region="shipments" rows={8} title="Shipments" emptyTitle="No shipments" emptyText="Nothing is planned yet. The first shipment you create appears here with its status, lane and times." emptyAction={{ label: 'New shipment', href: '/app/shipments/new' }} error={error} onRetry={reload}>
        <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite" data-result-count>
          {result.total ? <>Showing {result.from}–{result.to} of {result.total}{activeFilters.length ? ` · ${activeFilters.length} filter${activeFilters.length === 1 ? '' : 's'}` : ''}</> : 'No shipments match these filters.'}
        </p>
        {result.total === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-10 text-center" data-no-match>
            <FilterX className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">No match</p>
            <p className="text-sm text-muted-foreground">Widen the filters or clear the search.</p>
            <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
          </div>
        ) : (
          <ShipmentsTable rows={result.rows} state={tableState} columns={prefs.columns} onSort={(key: SortKey) => setState(toggleSort(tableState, key))} actions={{
            onView: (s, t) => setDetails({ open: true, shipment: s, returnTo: t }),
            onAssign: (s, t) => setAssign({ open: true, shipment: s, returnTo: t }),
            onDeliver: deliver,
            onCancel: (s, t) => setCancel({ open: true, shipment: s, returnTo: t }),
          }} />
        )}
        {result.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Select value={String(tableState.pageSize)} onValueChange={(v) => setState({ ...tableState, pageSize: Number(v), page: 1 })}>
              <SelectTrigger className="w-40" aria-label="Rows per page" data-page-size><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} per page</SelectItem>)}</SelectContent>
            </Select>
            <Pagination className="mx-0 w-auto" data-pagination>
              <PaginationContent className="flex-wrap">
                <PaginationItem><PaginationPrevious href={hrefFor({ ...tableState, page: result.page - 1 })} aria-disabled={result.page <= 1} className={result.page <= 1 ? 'pointer-events-none opacity-50' : ''} onClick={(e) => { e.preventDefault(); if (result.page > 1) setState({ ...tableState, page: result.page - 1 }) }} /></PaginationItem>
                {items.map((it, i) => it === 'gap' ? <PaginationItem key={`gap-${i}`}><PaginationEllipsis /></PaginationItem> : (
                  <PaginationItem key={it}><PaginationLink href={hrefFor({ ...tableState, page: it })} isActive={it === result.page} aria-current={it === result.page ? 'page' : undefined} aria-label={`Page ${it}`} onClick={(e) => { e.preventDefault(); setState({ ...tableState, page: it }) }}>{it}</PaginationLink></PaginationItem>
                ))}
                <PaginationItem><PaginationNext href={hrefFor({ ...tableState, page: result.page + 1 })} aria-disabled={result.page >= result.pages} className={result.page >= result.pages ? 'pointer-events-none opacity-50' : ''} onClick={(e) => { e.preventDefault(); if (result.page < result.pages) setState({ ...tableState, page: result.page + 1 }) }} /></PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </StateBlock>
      <ShipmentDetails overlay={details} onOpenChange={(o) => setDetails((d) => ({ ...d, open: o }))} />
      <AssignDriverDialog overlay={assign} mode={mode} onOpenChange={(o) => setAssign((d) => ({ ...d, open: o }))} onAssigned={(id, driverId) => patch(id, { driverId })} />
      <CancelShipmentDialog overlay={cancel} onOpenChange={(o) => setCancel((d) => ({ ...d, open: o }))} onConfirm={confirmCancel} />
    </div>
  )
}
