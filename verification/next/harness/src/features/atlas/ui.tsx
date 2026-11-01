'use client'
// Small building blocks of the enterprise app in Next, the shadcn vocabulary fed by the contract's roles: status by
// word, shape and colour; the five-state region renderer; the KPI tile; the two charts with their alternatives.
import Link from 'next/link'
import { Inbox, TriangleAlert } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtInt, STATUS_GLYPH, STATUS_LABEL, STATUS_TONE, type Kpi, type LaneLoad, type SeriesPoint, type ShipmentStatus } from '@/lib/ui/saas/data'
import type { RegionState } from './shipments-provider'

const TONE_CLASS: Record<string, string> = { neutral: 'bg-muted text-foreground', info: 'bg-dc-info/15 text-dc-info', warning: 'bg-dc-warning/15 text-dc-warning', danger: 'bg-dc-danger/15 text-dc-danger', success: 'bg-dc-success/15 text-dc-success' }

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge variant="outline" className={`gap-1 border-transparent font-medium ${TONE_CLASS[STATUS_TONE[status]]}`} data-status={status}><span aria-hidden="true">{STATUS_GLYPH[status]}</span>{STATUS_LABEL[status]}</Badge>
}

export function StateBlock({ state, region, rows = 6, title, emptyTitle, emptyText, emptyAction, error, onRetry, children }: { state: RegionState; region: string; rows?: number; title: string; emptyTitle: string; emptyText: string; emptyAction?: { label: string; href: string }; error?: { message: string; requestId: string } | null; onRetry: () => void; children: React.ReactNode }) {
  return (
    <div data-region={region} data-state={state}>
      {state === 'loading' && (
        <div role="status" aria-label={`Loading ${title}`} className="space-y-2" data-loading>
          {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          <span className="sr-only">Loading {title}</span>
        </div>
      )}
      {state === 'empty' && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-10 text-center" data-empty>
          <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{emptyTitle}</p>
          <p className="max-w-md text-sm text-muted-foreground">{emptyText}</p>
          {emptyAction && <Button asChild><Link href={emptyAction.href}>{emptyAction.label}</Link></Button>}
        </div>
      )}
      {state === 'error' && (
        <Alert variant="destructive" role="alert" data-error>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{title} could not be loaded</AlertTitle>
          <AlertDescription>{error?.message ?? 'The service did not answer.'} Request {error?.requestId}: quote it to the help desk if it keeps happening.</AlertDescription>
          <AlertAction><Button variant="outline" size="sm" onClick={onRetry}>Try again</Button></AlertAction>
        </Alert>
      )}
      {state === 'ready' && children}
    </div>
  )
}

export function KpiTile({ kpi }: { kpi: Kpi }) {
  const tone = { danger: 'text-dc-danger', warning: 'text-dc-warning', info: 'text-dc-info', success: 'text-dc-success', neutral: 'text-foreground' }[kpi.tone]
  const word = kpi.delta > 0 ? 'up' : kpi.delta < 0 ? 'down' : 'flat'
  return (
    <Link href={kpi.href} className="group block rounded-md border border-border bg-card p-4 transition-colors hover:border-input" data-kpi={kpi.id}>
      <p className="text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 flex items-baseline gap-1"><span className={`text-2xl font-semibold tabular-nums tracking-tight ${tone}`} data-kpi-value>{fmtInt(kpi.value)}</span>{kpi.unit && <span className="text-sm text-muted-foreground">{kpi.unit}</span>}</p>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground"><span className="font-medium">{word} {kpi.delta === 0 ? '' : Math.abs(kpi.delta)}</span> {kpi.deltaLabel}</p>
    </Link>
  )
}

export function DeliveriesChart({ series }: { series: SeriesPoint[] }) {
  // the bars are an SVG stretched to its box; the axis labels are HTML, so they follow the user's text size (text
  // inside a scaled viewBox keeps the size the viewBox gives it, whatever the reader's setting)
  const width = 560, height = 160
  const max = Math.max(...series.map((p) => p.volume)) || 1
  const scaleY = (v: number) => height - (v / max) * height
  const slot = width / series.length
  const barW = slot * 0.62
  const x = (i: number) => (i + 0.19) * slot
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f))
  const axis = [...ticks].reverse()
  const late = series.reduce((s, p) => s + p.late, 0)
  const total = series.reduce((s, p) => s + p.volume, 0)
  const summary = `${fmtInt(total)} deliveries in 14 days, ${fmtInt(late)} late (${Math.round((100 * late) / Math.max(1, total))}%)`
  return (
    <figure className="rounded-md border border-border bg-card p-4" data-chart="deliveries">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1"><span className="font-medium">Deliveries, last 14 days</span><span className="text-sm text-muted-foreground">{summary}</span></figcaption>
      <div className="grid grid-cols-[auto_1fr] gap-x-2" role="img" aria-label={`Stacked bars of on-time and late deliveries per day. ${summary}`}>
        <div className="flex h-40 flex-col justify-between text-right text-xs leading-none tabular-nums text-muted-foreground" aria-hidden="true" data-axis="y">
          {axis.map((t, i) => <span key={i} className={i === 0 ? '-translate-y-1/2' : i === axis.length - 1 ? 'translate-y-1/2' : ''} data-axis-label>{t}</span>)}
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-40 w-full overflow-visible" aria-hidden="true">
          {ticks.map((t, i) => <line key={i} x1={0} x2={width} y1={scaleY(t)} y2={scaleY(t)} stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
          {series.map((p, i) => (
            <g key={p.day}>
              <rect x={x(i)} y={scaleY(p.onTime + p.late)} width={barW} height={scaleY(0) - scaleY(p.late)} fill="var(--dc-danger)"><title>{p.day}: {p.late} late</title></rect>
              <rect x={x(i)} y={scaleY(p.onTime)} width={barW} height={scaleY(0) - scaleY(p.onTime)} fill="var(--color-accent-500)"><title>{p.day}: {p.onTime} on time</title></rect>
            </g>
          ))}
        </svg>
        <span aria-hidden="true" />
        <ol className="mt-1 grid text-xs tabular-nums text-muted-foreground" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }} aria-hidden="true" data-axis="x">
          {series.map((p, i) => <li key={p.day} className="text-center">{i % 2 === 0 && <span data-axis-label>{p.day.slice(5)}</span>}</li>)}
        </ol>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground"><span><span className="mr-1 inline-block size-2.5 rounded-sm align-middle" style={{ background: 'var(--color-accent-500)' }} aria-hidden="true" />On time</span><span><span className="mr-1 inline-block size-2.5 rounded-sm align-middle" style={{ background: 'var(--dc-danger)' }} aria-hidden="true" />Late</span></div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Data table</summary>
        <table className="mt-2 w-full min-w-0 text-xs tabular-nums"><caption className="sr-only">Deliveries per day</caption><thead><tr className="text-left text-muted-foreground"><th scope="col" className="py-1 font-medium">Day</th><th scope="col" className="py-1 font-medium">On time</th><th scope="col" className="py-1 font-medium">Late</th></tr></thead><tbody>{series.map((p) => <tr key={p.day} className="border-t border-border"><td className="py-1">{p.day}</td><td className="py-1">{p.onTime}</td><td className="py-1">{p.late}</td></tr>)}</tbody></table>
      </details>
    </figure>
  )
}

export function LaneChart({ lanes }: { lanes: LaneLoad[] }) {
  const max = Math.max(...lanes.map((l) => l.shipments)) || 1
  return (
    <figure className="rounded-md border border-border bg-card p-4" data-chart="lanes">
      <figcaption className="mb-3 font-medium">Open shipments by lane</figcaption>
      <ol className="space-y-2" aria-label={`Open shipments by lane, ${lanes.length} lanes`}>
        {lanes.map((l) => (
          <li key={l.lane} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[4.5rem_1fr_auto]">
            <span className="font-mono text-xs text-muted-foreground">{l.lane}</span>
            <span className="order-3 col-span-2 h-3 rounded-sm bg-border sm:order-none sm:col-span-1" aria-hidden="true"><span className="block h-3 rounded-sm bg-primary" style={{ width: `${(100 * l.shipments) / max}%` }} /></span>
            <span className="tabular-nums"><span className="font-medium">{fmtInt(l.shipments)}</span> <span className="text-muted-foreground">· {fmtInt(l.weightT)} t</span></span>
          </li>
        ))}
      </ol>
    </figure>
  )
}
