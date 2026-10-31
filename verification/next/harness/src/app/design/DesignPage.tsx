'use client'
// The design system page: the contract rendered by the app that consumes it, through shadcn's vocabulary fed by the
// contract's roles (globals.css). Colours are read back from the computed styles, so the page shows what the
// stylesheet applies in the active theme, and the ratios are computed from those values.
import { useCallback, useEffect, useState } from 'react'
import contract from '@/design/contract.json'
import { Button } from '@/components/ui/button'
import { ThemeToggle, useTheme } from './theme-toggle'

const ROLES = ['canvas', 'surface', 'surface-raised', 'fg', 'fg-muted', 'border', 'border-strong', 'accent', 'accent-fg', 'accent-hover', 'focus', 'success', 'success-fg', 'warning', 'warning-fg', 'danger', 'danger-fg', 'info', 'info-fg'] as const
const PAIRS: Array<[string, string, number]> = [['fg', 'canvas', 4.5], ['fg-muted', 'canvas', 4.5], ['fg', 'surface', 4.5], ['accent-fg', 'accent', 4.5], ['accent', 'canvas', 4.5], ['border-strong', 'canvas', 3], ['focus', 'canvas', 3], ['danger', 'canvas', 4.5]]
const luminance = (hex: string) => {
  const c = hex.replace('#', '')
  const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const n = (i: number) => parseInt(c.slice(i, i + 2), 16)
  return 0.2126 * lin(n(0)) + 0.7152 * lin(n(2)) + 0.0722 * lin(n(4))
}
const rgbToHex = (rgb: string) => { const m = rgb.match(/\d+/g); return m ? '#' + m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('') : rgb }

export function DesignPage() {
  const { theme, toggle } = useTheme()
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [ratios, setRatios] = useState<Array<{ fg: string; bg: string; ratio: number; required: number }>>([])
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const measure = useCallback(() => {
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const out: Record<string, string> = {}
    for (const role of ROLES) { probe.style.color = `var(--dc-${role})`; out[role] = rgbToHex(getComputedStyle(probe).color) }
    probe.remove()
    setResolved(out)
    setRatios(PAIRS.map(([fg, bg, required]) => { const a = luminance(out[fg]!), b = luminance(out[bg]!); const [hi, lo] = a > b ? [a, b] : [b, a]; return { fg, bg, required, ratio: Number(((hi + 0.05) / (lo + 0.05)).toFixed(2)) } }))
  }, [])
  useEffect(() => { const id = requestAnimationFrame(measure); return () => cancelAnimationFrame(id) }, [measure, theme])
  const confirm = async () => { setBusy(true); await new Promise((r) => setTimeout(r, 600)); setBusy(false); setSent(true) }
  const sizes = Object.keys(contract.typography.steps)
  return (
    <main className="mx-auto max-w-(--container-page) px-4 py-8 text-foreground sm:px-6" data-design-page>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Design contract · {contract.name} v{contract.version} · {contract.density}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{contract.direction.adjectives.join(' · ')}</h1>
          <p className="mt-2 max-w-prose whitespace-pre-line text-muted-foreground">{contract.direction.statement}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground" data-theme-name>{theme}</span>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      <section aria-labelledby="roles" className="mb-10">
        <h2 id="roles" className="mb-3 text-lg font-semibold">Colour roles as applied</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-roles>
          {ROLES.map((role) => (
            <li key={role} className="rounded-md border border-border p-2 text-sm" data-role={role}>
              <span className="mb-2 block h-10 rounded-sm border border-border" style={{ background: `var(--dc-${role})` }} aria-hidden="true" />
              <span className="block font-medium">{role}</span>
              <span className="block break-all font-mono text-xs text-muted-foreground" data-hex>{resolved[role]}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm" data-pairs>
          <caption className="sr-only">Contrast of the semantic pairs in the active theme</caption>
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-4 font-medium">Pair</th><th className="py-1 pr-4 font-medium">Ratio</th><th className="py-1 font-medium">Required</th></tr></thead>
          <tbody>
            {ratios.map((p) => (
              <tr key={p.fg + p.bg} className="border-t border-border" data-pair={`${p.fg}/${p.bg}`} data-pass={String(p.ratio >= p.required)}>
                <td className="py-1 pr-4">{p.fg} on {p.bg}</td>
                <td className="py-1 pr-4 tabular-nums">{p.ratio}:1</td>
                <td className="py-1 tabular-nums">{p.required}:1 {p.ratio >= p.required ? <span className="text-dc-success">✓ passes</span> : <span className="text-dc-danger">✗ below</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>

      <section aria-labelledby="type" className="mb-10">
        <h2 id="type" className="mb-3 text-lg font-semibold">Type scale · ratio {contract.typography.ratio}</h2>
        <ol className="space-y-2" data-type-scale>
          {sizes.map((name) => (
            <li key={name} className="flex items-baseline gap-4 border-b border-border pb-2">
              <span className="w-12 font-mono text-xs text-muted-foreground">{name}</span>
              <span style={{ fontSize: `var(--text-${name})` }} className="min-w-0 break-words leading-tight">Dispatch board, 14 loads unassigned</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 font-mono text-sm tabular-nums">1,284.50 · 0.75 · 12:40 · tabular numbers {contract.typography.tabularNumbers ? 'on' : 'off'}</p>
      </section>

      <section aria-labelledby="space" className="mb-10 grid gap-8 lg:grid-cols-3">
        <div>
          <h2 id="space" className="mb-3 text-lg font-semibold">Spacing · {contract.spacing.base}px base</h2>
          <ul className="space-y-1" data-spacing>
            {contract.spacing.scale.map((v) => (
              <li key={v} className="flex items-center gap-3 text-sm"><span className="h-3 bg-primary" style={{ width: `var(--space-${v})` }} aria-hidden="true" /><span className="font-mono text-muted-foreground">{v}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Radius · {contract.radius.policy}</h2>
          <ul className="flex flex-wrap gap-3" data-radius>
            {Object.entries(contract.radius.scale).map(([name, px]) => (
              <li key={name} className="flex flex-col items-center gap-1 text-xs text-muted-foreground"><span className="block h-12 w-12 border border-input bg-card" style={{ borderRadius: `var(--radius-${name})` }} aria-hidden="true" />{name} · {px >= 9999 ? 'full' : `${px}px`}</li>
            ))}
          </ul>
          <h2 className="mb-3 mt-6 text-lg font-semibold">Elevation · {contract.elevation.policy}</h2>
          <ul className="flex flex-wrap gap-4" data-elevation>
            {contract.elevation.levels.map((level) => (
              <li key={level.name} className="flex h-16 w-24 items-center justify-center rounded-md bg-popover text-xs text-muted-foreground" style={{ boxShadow: `var(--shadow-${level.name})` }}>{level.name}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Motion · reduced motion {contract.motion.reducedMotion}</h2>
          <ul className="space-y-2 text-sm" data-motion>
            {Object.entries(contract.motion.durations).map(([name, ms]) => (
              <li key={name} className="flex items-center gap-3"><span className="w-10 font-mono text-muted-foreground">{name}</span><span className="h-2 flex-1 rounded-full bg-border"><span className="motion-bar block h-2 rounded-full bg-primary" style={{ animationDuration: `${ms}ms` }} /></span><span className="font-mono tabular-nums text-muted-foreground">{ms}ms</span></li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="states" className="mb-10">
        <h2 id="states" className="mb-3 text-lg font-semibold">Interactive states</h2>
        <div className="flex flex-wrap items-center gap-3" data-states>
          <Button>Primary action</Button>
          <Button variant="outline">Secondary</Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled={busy} data-confirm onClick={confirm}>{busy ? 'Saving…' : sent ? 'Saved' : 'Save preference'}</Button>
          <input type="search" placeholder="Search shipments" aria-label="Search shipments" className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm" />
          <span className="rounded-full bg-dc-success/15 px-2 py-0.5 text-xs font-medium text-dc-success">On time</span>
          <span className="rounded-full bg-dc-warning/15 px-2 py-0.5 text-xs font-medium text-dc-warning">At risk</span>
          <span className="rounded-full bg-dc-danger/15 px-2 py-0.5 text-xs font-medium text-dc-danger">Late</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Focus ring: {contract.states.focusRing.width}px, offset {contract.states.focusRing.offset}px · targets ≥ {contract.states.minTarget}px · disabled at {contract.states.disabledOpacity} opacity · hover: {contract.states.hover}</p>
      </section>
      <style>{`.motion-bar { width: 0; animation-name: grow; animation-timing-function: var(--ease-standard); animation-fill-mode: forwards; animation-iteration-count: infinite; animation-direction: alternate; } @keyframes grow { from { width: 0 } to { width: 100% } }`}</style>
    </main>
  )
}
