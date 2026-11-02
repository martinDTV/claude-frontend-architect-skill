// route-attribution (1.6 increment 4): per-route bundle attribution and rendering-strategy intelligence. Each fixture
// carries a truth written before the tool ran (expected-attribution.json): structural facts (file counts, shared chunks,
// strategy, confidence) and raw-size thresholds, never exact gzip bytes (those are version- and entropy-fragile). The
// tests assert the honesty contract: a lazy chunk is excluded from the initial set, a shared chunk is counted once per
// route and the two routes are not summed, strategy carries its evidence and confidence, and a missing manifest is
// reported as unavailable with a reason rather than guessed or crashed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fixtures, here, runTool } from './helpers.mjs'

const truthOf = (app) => JSON.parse(readFileSync(join(fixtures, app, 'expected-attribution.json'), 'utf8'))
const routeOf = (report, path) => report.data.routes.find((r) => r.route === path)
const run = (app, extra = []) => runTool('route-attribution.mjs', [join(fixtures, app), '--no-perf', ...extra])

test('next fixture: strategy, initial set, lazy exclusion and shared-counted-once match the truth', () => {
  const { code, report } = run('route-next-app')
  assert.equal(code, 0, 'route-attribution explains, it does not gate: exit 0 by default')
  const truth = truthOf('route-next-app')
  assert.equal(report.summary.routes, truth.routesTotal)
  assert.equal(report.summary.routesWithBuildAttribution, truth.routesWithBuildAttribution)
  assert.equal(report.summary.routesAttributionUnavailable, truth.routesUnavailable)
  for (const [path, want] of Object.entries(truth.routes)) {
    const r = routeOf(report, path)
    assert.ok(r, `route ${path} present`)
    assert.ok(r.strategy.startsWith(want.strategyStartsWith), `${path}: strategy "${r.strategy}" starts with "${want.strategyStartsWith}"`)
    assert.equal(r.strategyConfidence, want.strategyConfidence, `${path}: strategy confidence`)
    if (want.attributionConfidence) { assert.equal(r.attribution.confidence, want.attributionConfidence, `${path}: attribution confidence`); continue }
    const a = r.attribution
    assert.equal(a.initialClientJs.files, want.files, `${path}: initial file count`)
    assert.equal(a.sharedChunks, want.sharedChunks, `${path}: shared chunk count`)
    if (want.rawKbAtLeast != null) assert.ok(a.initialClientJs.rawKb >= want.rawKbAtLeast, `${path}: raw >= ${want.rawKbAtLeast} (got ${a.initialClientJs.rawKb})`)
    if (want.rawKbAtMost != null) assert.ok(a.initialClientJs.rawKb <= want.rawKbAtMost, `${path}: raw <= ${want.rawKbAtMost} (got ${a.initialClientJs.rawKb})`)
    if (want.lazyChunkExcluded) assert.ok(!(a.topFiles || []).some((f) => f.includes(want.lazyChunkExcluded)), `${path}: the lazy chunk ${want.lazyChunkExcluded} is not in the initial set`)
    if (want.mustIncludeHeavyVendor) assert.ok((a.topFiles || []).some((f) => /heavy-vendor/.test(f)), `${path}: the heavy vendor chunk is in the initial set`)
    if (want.includesSharedWidget) assert.ok((a.topFiles || []).some((f) => /shared-widget/.test(f)), `${path}: the shared widget is in the initial set`)
  }
  // a heavy chunk in the initial set is a heuristic finding on /heavy only, never on /light
  const heavy = report.findings.filter((f) => f.id === 'route-heavy-initial-chunk')
  assert.ok(heavy.some((f) => f.file === '/heavy') && heavy.every((f) => f.level === 'heuristic'), 'the heavy-initial-chunk finding fires on /heavy as a heuristic')
  assert.ok(!heavy.some((f) => f.file === '/light'), 'the light route, whose heavy chunk is lazy, does not get the heavy finding')
})

test('next fixture: a shared chunk is counted once per route, the two routes are not summed into an inflated total', () => {
  const { report } = run('route-next-app')
  const a = routeOf(report, '/shared-a').attribution
  const b = routeOf(report, '/shared-b').attribution
  // each route's initial raw includes shared-widget (40k) once; they are reported per route, never added together
  assert.ok(Math.abs(a.initialClientJs.rawKb - b.initialClientJs.rawKb) < 2, 'the two routes that share a widget report the same size, each counting it once')
  const widgetOnce = (a.topFiles || []).filter((f) => /shared-widget/.test(f)).length
  assert.equal(widgetOnce, 1, 'the shared widget appears once in a route\'s own file list, not duplicated')
})

test('nuxt fixture: route rules and the ambiguous app-level ssr:false are reported honestly', () => {
  const { code, report } = run('route-nuxt-app')
  assert.equal(code, 0)
  const truth = truthOf('route-nuxt-app')
  assert.equal(report.summary.routes, truth.routesTotal)
  for (const [path, want] of Object.entries(truth.routes)) {
    const r = routeOf(report, path)
    assert.ok(r, `route ${path} present`)
    assert.ok(r.strategy.includes(want.strategyContains), `${path}: strategy "${r.strategy}" contains "${want.strategyContains}"`)
    assert.equal(r.strategyConfidence, want.strategyConfidence, `${path}: strategy confidence`)
    assert.equal(r.attribution.initialClientJs.files, want.files, `${path}: initial file count`)
    if (want.sharedChunks != null) assert.equal(r.attribution.sharedChunks, want.sharedChunks, `${path}: shared chunks`)
    if (want.rawKbAtLeast != null) assert.ok(r.attribution.initialClientJs.rawKb >= want.rawKbAtLeast, `${path}: raw >= ${want.rawKbAtLeast}`)
  }
  // the admin route matched its ssr:false route rule with config confidence; the SSR routes are heuristic (ambiguous)
  assert.equal(routeOf(report, '/admin').strategyConfidence, 'config')
  assert.equal(routeOf(report, '/heavy').strategyConfidence, 'heuristic')
})

test('missing manifests degrade to unavailable with a reason, never a guess or a crash', () => {
  const { code, report } = run('route-next-nomanifest')
  assert.equal(code, 0, 'no crash')
  const orphan = routeOf(report, '/orphan')
  assert.ok(orphan, 'the route listed in routes-manifest is reported')
  assert.equal(orphan.attribution.confidence, 'unavailable', 'with no client-reference manifest, attribution is unavailable')
  assert.ok(orphan.attribution.reason && orphan.attribution.reason.length > 10, 'and the reason is given')
  assert.ok(!report.findings.some((f) => f.level === 'confirmed'), 'nothing is confirmed from an incomplete build')
})

test('the honesty contract is stated and no finding is confirmed (this tool explains, it does not gate)', () => {
  for (const app of ['route-next-app', 'route-nuxt-app']) {
    const { report } = run(app)
    assert.ok(report.notes.some((n) => /not a route-associated chunk is not a browser-requested chunk/.test(n)), `${app}: the built/associated/requested/transferred/used distinction is stated`)
    assert.ok(!report.findings.some((f) => f.level === 'confirmed'), `${app}: no confirmed finding`)
    // every build-attributed route carries its evidence source
    for (const r of report.data.routes) if (r.attribution.confidence === 'build-manifest') assert.ok(r.attribution.source, `${app} ${r.route}: build attribution names its source`)
  }
})

test('the reference applications are attributed without error and with build-manifest confidence where available', () => {
  for (const app of ['nuxt', 'next']) {
    const { code, report } = runTool('route-attribution.mjs', [join(here, '..', app), '--no-perf'])
    assert.equal(code, 0, `${app}: exit 0`)
    assert.ok(report.data.routes.length >= 10, `${app}: routes inventoried (${report.data.routes.length})`)
    assert.ok(report.data.routes.some((r) => r.attribution.confidence === 'build-manifest'), `${app}: at least one route has build attribution`)
    // the heavy 3D route carries a lead where the build shows a heavy initial chunk; the light labs do not
    if (app === 'nuxt') {
      const tres = report.data.routes.find((r) => r.route === '/lab/atelier-tres')
      const atelier = report.data.routes.find((r) => r.route === '/lab/atelier')
      if (tres && atelier) assert.ok(tres.attribution.initialClientJs.gzipKb > atelier.attribution.initialClientJs.gzipKb, 'the eager-Three.js Tres route ships more initial JS than the lazy R3F-style lab')
    }
  }
})

test('the report carries the full contract shape including analysis (increment 6 audit)', () => {
  const keys = ['tool', 'version', 'root', 'framework', 'summary', 'findings', 'notes', 'data', 'analysis']
  const { report } = run('route-next-app')
  for (const k of keys) assert.ok(k in report, `route-attribution report lacks ${k}`)
})
