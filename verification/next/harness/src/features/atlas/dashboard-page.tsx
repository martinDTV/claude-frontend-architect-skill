'use client'
// The dashboard: attention first (five KPIs), two charts, the exceptions table; one region with its five states.
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { computeKpis, DATASET, deliverySeries, fmtDateTime, fmtRelative, laneLoads, NOW } from '@/lib/ui/saas/data'
import { useShipments } from './shipments-provider'
import { DeliveriesChart, KpiTile, LaneChart, StateBlock, StatusBadge } from './ui'

const series = deliverySeries()

export function DashboardPage() {
  const { rows, state, error, reload } = useShipments()
  const dataset = { shipments: rows, vehicles: rows.length ? DATASET.vehicles : [], drivers: DATASET.drivers }
  const kpis = computeKpis(dataset)
  const lanes = laneLoads(dataset)
  const exceptions = rows.filter((s) => s.status === 'late' || s.status === 'at-risk').sort((a, b) => (a.status === b.status ? a.eta.localeCompare(b.eta) : a.status === 'late' ? -1 : 1)).slice(0, 8)
  return (
    <div className="@container space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <span className="text-xs tabular-nums text-muted-foreground">Updated {fmtDateTime(NOW)} UTC</span>
      </div>
      <StateBlock state={state} region="kpis" rows={2} title="Today's numbers" emptyTitle="No shipments yet" emptyText="The dashboard fills in as soon as the first shipment is planned. Create one to see late, at-risk and unassigned loads here." emptyAction={{ label: 'Plan the first shipment', href: '/app/shipments/new' }} error={error} onRetry={reload}>
        <section aria-labelledby="kpis">
          <h2 id="kpis" className="sr-only">Key numbers</h2>
          <ul className="grid grid-cols-1 gap-3 @xs:grid-cols-2 @3xl:grid-cols-3 @4xl:grid-cols-5" data-kpis>{kpis.map((k) => <li key={k.id}><KpiTile kpi={k} /></li>)}</ul>
        </section>
        <section aria-labelledby="charts" className="mt-6 grid grid-cols-1 gap-4 @4xl:grid-cols-5">
          <h2 id="charts" className="sr-only">Trends</h2>
          <div className="min-w-0 @4xl:col-span-3"><DeliveriesChart series={series} /></div>
          <div className="min-w-0 @4xl:col-span-2"><LaneChart lanes={lanes} /></div>
        </section>
        <section aria-labelledby="exceptions" className="mt-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="exceptions" className="text-lg font-semibold">Exceptions · late and at risk</h2>
            <Button asChild variant="link"><Link href="/app/shipments?status=late,at-risk">View all <ArrowRight aria-hidden="true" /></Link></Button>
          </div>
          <div className="rounded-md border border-border bg-card" data-exceptions>
            <Table aria-label="Late and at-risk shipments" containerProps={{ tabIndex: 0, role: 'region', 'aria-label': 'Late and at-risk shipments, scrolls sideways on narrow screens', className: 'scroll-hint-x' }}>
              <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Customer</TableHead><TableHead>Lane</TableHead><TableHead>Status</TableHead><TableHead>ETA</TableHead></TableRow></TableHeader>
              <TableBody>{exceptions.map((s) => <TableRow key={s.id}><TableCell className="font-mono text-sm">{s.reference}</TableCell><TableCell>{s.customer}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{s.lane}</TableCell><TableCell><StatusBadge status={s.status} /></TableCell><TableCell className="tabular-nums">{fmtDateTime(s.eta)} · {fmtRelative(s.eta)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </section>
      </StateBlock>
    </div>
  )
}
