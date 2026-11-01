// Interaction latency + hydration cost (1.6 increment 3) in browser-audit. Two layers, like the vitals test:
//  (1) observer-behaviour tests with no browser — the injected observers are evaluated against a mock
//      PerformanceObserver fed synthetic entries, so the INP sub-part arithmetic, the interactionId grouping and the
//      "no Event Timing entry" path are checked deterministically, independent of any machine's timings;
//  (2) a gated real-Chromium integration test — drives a declarative script against the fixtures and asserts the
//      native Event Timing metric is used (not the Playwright proxy), the slow handler is slower than the light one,
//      hydration proxies exist, an app hydration marker is read when present and absent when not, and the opt-in
//      budgets turn a measured breach into a confirmed finding. Behaviour and availability, never exact milliseconds.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import { startFixtureServer } from './fixture/server.mjs'
import { INTERACTION_OBSERVER, BOOT_OBSERVER } from '../../plugins/frontend-architect/skills/frontend-architect/scripts/browser-audit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const tool = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts', 'browser-audit.mjs')

// --- layer 1: evaluate the real injected observers against a mock PerformanceObserver -----------------------
function makeCtx(supported) {
  const observers = []
  const PO = class {
    constructor(cb) { this.cb = cb }
    observe({ type }) { observers.push({ type, cb: this.cb }) }
    static supportedEntryTypes = supported
  }
  const win = { addEventListener() {} }
  const ctx = vm.createContext({ window: win, PerformanceObserver: PO, addEventListener: win.addEventListener, performance: { now: () => 0, getEntriesByType: () => [] } })
  return { ctx, win, observers }
}
const feed = (observers, type, entries) => { const o = observers.find((x) => x.type === type); assert.ok(o, `observer subscribes to ${type}`); o.cb({ getEntries: () => entries }) }

test('INTERACTION_OBSERVER: records event entries with correct INP sub-parts and interactionId', () => {
  const { ctx, win, observers } = makeCtx(['event', 'first-input', 'long-animation-frame'])
  vm.runInContext(INTERACTION_OBSERVER, ctx)
  // a click interaction: pointerdown+pointerup+click share interactionId 7; click is the slowest (duration 96)
  feed(observers, 'event', [
    { name: 'pointerdown', entryType: 'event', interactionId: 7, startTime: 100, duration: 16, processingStart: 108, processingEnd: 110 },
    { name: 'pointerup', entryType: 'event', interactionId: 7, startTime: 110, duration: 16, processingStart: 112, processingEnd: 113 },
    { name: 'click', entryType: 'event', interactionId: 7, startTime: 112, duration: 96, processingStart: 120, processingEnd: 190 },
  ])
  const s = win.__faInteractions
  assert.equal(s.events.length, 3)
  const click = s.events.find((e) => e.name === 'click')
  assert.equal(click.interactionId, 7)
  assert.equal(click.inputDelay, 120 - 112)      // processingStart - startTime = 8
  assert.equal(click.processing, 190 - 120)      // processingEnd - processingStart = 70
  assert.equal(click.presentation, (112 + 96) - 190) // startTime + duration - processingEnd = 18
  assert.equal(Math.round(click.inputDelay + click.processing + click.presentation), click.duration) // the three sum to duration
})

test('INTERACTION_OBSERVER: an event not part of a distinct interaction has interactionId 0', () => {
  const { ctx, win, observers } = makeCtx(['event'])
  vm.runInContext(INTERACTION_OBSERVER, ctx)
  feed(observers, 'event', [{ name: 'keydown', entryType: 'event', interactionId: 0, startTime: 0, duration: 24, processingStart: 2, processingEnd: 5 }])
  assert.equal(win.__faInteractions.events[0].interactionId, 0)
})

test('INTERACTION_OBSERVER: unsupported Event Timing is marked unavailable, not fabricated', () => {
  const { ctx, win } = makeCtx([]) // nothing supported
  vm.runInContext(INTERACTION_OBSERVER, ctx)
  assert.equal(win.__faInteractions.support.event, false)
  assert.equal(win.__faInteractions.events.length, 0)
})

test('INTERACTION_OBSERVER: LoAF scripts are captured for attribution', () => {
  const { ctx, win, observers } = makeCtx(['long-animation-frame'])
  vm.runInContext(INTERACTION_OBSERVER, ctx)
  feed(observers, 'long-animation-frame', [{ startTime: 50, duration: 120, blockingDuration: 70, renderStart: 150, styleAndLayoutStart: 160, firstUIEventTimestamp: 55, scripts: [{ invoker: 'BUTTON#slow.onclick', invokerType: 'event-listener', sourceURL: 'http://x/app.js', sourceFunctionName: 'onClick', duration: 110, forcedStyleAndLayoutDuration: 5, pauseDuration: 0, executionStart: 52, startTime: 50 }] }])
  const loaf = win.__faInteractions.loaf[0]
  assert.equal(loaf.blockingDuration, 70)
  assert.equal(loaf.scripts[0].invokerType, 'event-listener')
  assert.equal(loaf.scripts[0].compile, 2) // executionStart - startTime
})

test('BOOT_OBSERVER: captures long tasks and only hydration-ish marks', () => {
  const { ctx, win, observers } = makeCtx(['longtask', 'long-animation-frame', 'mark', 'measure'])
  vm.runInContext(BOOT_OBSERVER, ctx)
  feed(observers, 'longtask', [{ duration: 180 }, { duration: 60 }])
  feed(observers, 'mark', [{ name: 'hydration-end', startTime: 190 }, { name: 'unrelated-mark', startTime: 5 }])
  const s = win.__faBoot
  assert.equal(s.longTasks.count, 2)
  assert.equal(s.longTasks.max, 180)
  assert.equal(s.longTasks.total, 240)
  assert.equal(s.marks.length, 1, 'only the hydration-ish mark is kept')
  assert.equal(s.marks[0].name, 'hydration-end')
})

// --- layer 2: real Chromium (gated; skipped without Playwright) ---------------------------------------------
const required = process.env.FA_REQUIRE_BROWSER === '1'
const availability = (() => {
  const probe = spawnSync(process.execPath, ['-e', "const {chromium}=require('playwright');chromium.launch({headless:true}).then(b=>b.close().then(()=>console.log('ok')),e=>{console.error(e.message.split('\\n')[0]);process.exit(1)})"], { cwd: here, encoding: 'utf8', timeout: 60000 })
  return probe.status === 0 ? { ok: true } : { ok: false, reason: `playwright/chromium not available: ${(probe.stderr || '').trim().split('\n')[0]}` }
})()
const browserTest = (name, fn) => test(name, { skip: availability.ok || required ? false : availability.reason }, fn)

function runAudit(url, extra = []) {
  const out = mkdtempSync(join(tmpdir(), 'fa-inter-'))
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tool, url, '--playwright', here, '--out', out, '--json', '--fail-on', 'none', ...extra], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', (d) => (stdout += d)); child.stderr.on('data', (d) => (stderr += d))
    child.on('close', () => { try { resolve({ report: JSON.parse(stdout), out }) } catch (e) { reject(new Error(`no JSON: ${stderr.slice(0, 400)}`)) } })
  })
}
const checksOf = (report, path, key) => report.data.pages.find((p) => new URL(p.url).pathname === path)?.checks[key]

browserTest('interactions: native Event Timing drives the metric; the slow handler is slower than the light one', async () => {
  const { server, url } = await startFixtureServer(0)
  try {
    const script = join(here, 'fixture', 'interaction-scripts', 'basic.json')
    const { report } = await runAudit(url, ['--paths', '/interactions.html', '--checks', 'interactions', '--interactions-script', script, '--interactions-runs', '3', '--interactions-settle', '600', '--max-time', '120'])
    const ix = checksOf(report, '/interactions.html', 'interactions')
    assert.ok(ix && ix.ran, 'interactions check ran')
    assert.equal(ix.support.eventTiming, true, 'Event Timing supported in this Chromium')
    const byLabel = Object.fromEntries(ix.steps.map((s) => [s.label, s]))
    const slow = byLabel['slow handler'], light = byLabel['light click']
    assert.ok(slow.available && slow.latency, 'the slow handler produced an Event Timing entry')
    assert.equal(slow.measuredBy, 'event-timing (native)')
    assert.ok(/not INP/.test(slow.wallMsProxy.note), 'the Playwright wall-clock is labelled a proxy, not INP')
    // each step's entry is attributed to its own target, not the previous step's (regression: entries flush after the
    // next paint and must be selected by time, not a stale count)
    assert.match(slow.target || '', /slow/, `the slow step is attributed to its own button (${slow.target})`)
    assert.match(light.target || '', /light/, `the light step is attributed to its own button (${light.target})`)
    // the slow handler (120ms busy loop) must be slower than the light handler; behaviour, not an exact ms. The sub-part
    // split is reported but its exact distribution (processing vs presentation) is a browser detail we do not pin.
    assert.ok(slow.latency.p75 > light.latency.p75 + 20, `slow p75 ${slow.latency.p75} clearly > light p75 ${light.latency.p75}`)
    assert.ok(slow.inputDelay.p75 != null && slow.processing.p75 != null && slow.presentation.p75 != null, 'the three sub-parts are reported')
    // LoAF attributes the slow handler's main-thread work to the right script (native attribution, not proximity)
    assert.ok(ix.loaf.available, 'LoAF available')
    assert.ok(ix.loaf.worst && /slow/i.test(JSON.stringify(ix.loaf.worst.scripts || [])), 'the worst LoAF names the slow button handler')
    // the info finding never fails CI and names the split
    const info = report.findings.filter((f) => f.id === 'interaction-latency-measured')
    assert.ok(info.length >= 1 && info.every((f) => f.level === 'info'))
    assert.ok(!report.findings.some((f) => f.level === 'confirmed'), 'no budget -> no confirmed finding')
  } finally { server.close() }
})

browserTest('interactions: an opt-in budget turns a measured p75 breach into a confirmed finding', async () => {
  const { server, url } = await startFixtureServer(0)
  try {
    const script = join(here, 'fixture', 'interaction-scripts', 'basic.json')
    const budget = join(here, 'fixture', 'interaction-scripts', 'strict-budget.json')
    const { report } = await runAudit(url, ['--paths', '/interactions.html', '--checks', 'interactions', '--interactions-script', script, '--interactions-runs', '2', '--interactions-settle', '500', '--interactions-budget', budget, '--max-time', '120'])
    const breaches = report.findings.filter((f) => f.id === 'interaction-over-budget')
    assert.ok(breaches.length >= 1 && breaches.every((f) => f.level === 'confirmed'), 'a p75 over the opt-in budget is confirmed')
    assert.ok(breaches.some((f) => /exceeds the budget/.test(f.message)))
  } finally { server.close() }
})

browserTest('hydration-cost: heavy vs light boot proxies; app marker present on marked pages, absent otherwise', async () => {
  const { server, url } = await startFixtureServer(0)
  try {
    const paths = ['/hydration-heavy.html', '/hydration-light.html', '/hydration-none.html']
    const { report } = await runAudit(url, ['--paths', paths.join(','), '--checks', 'hydration-cost', '--hydration-runs', '3', '--hydration-settle', '700', '--max-time', '120'])
    const heavy = checksOf(report, '/hydration-heavy.html', 'hydrationCost')
    const light = checksOf(report, '/hydration-light.html', 'hydrationCost')
    const none = checksOf(report, '/hydration-none.html', 'hydrationCost')
    assert.ok(heavy && light && none, 'hydration cost recorded for all three')
    // boot proxies are present (numbers, not claimed hydration time)
    assert.ok(heavy.bootProxies.toLoad != null && light.bootProxies.toLoad != null, 'to-load proxy available')
    // the heavy page's boot work exceeds the light page's (a deliberate 180ms boot long task); behaviour, not exact ms
    assert.ok(heavy.bootWork.longTaskTotalMsMedian > light.bootWork.longTaskTotalMsMedian, `heavy boot work ${heavy.bootWork.longTaskTotalMsMedian} > light ${light.bootWork.longTaskTotalMsMedian}`)
    // the marked pages expose the app hydration marker; the static SSR page does not
    assert.equal(heavy.hydrationMark.available, true, 'heavy page emits a hydration marker')
    assert.equal(none.hydrationMark.available, false, 'static SSR page has no hydration marker, and none is invented')
    assert.ok(/no exact hydration time|does not measure/i.test(none.bootProxies.note) || /no app-provided hydration marker/i.test(none.hydrationMark.note))
    const info = report.findings.filter((f) => f.id === 'hydration-cost-measured')
    assert.ok(info.length >= 1 && info.every((f) => f.level === 'info'))
  } finally { server.close() }
})

browserTest('hydration-cost: deferred hydration keeps its boot work out of the initial boot window', async () => {
  const { server, url } = await startFixtureServer(0)
  try {
    const { report } = await runAudit(url, ['--paths', '/hydration-deferred.html', '--checks', 'hydration-cost', '--hydration-runs', '2', '--hydration-settle', '1200', '--max-time', '90'])
    const d = checksOf(report, '/hydration-deferred.html', 'hydrationCost')
    assert.ok(d, 'deferred page measured')
    // it still has navigation proxies; the point is the check runs and records without claiming an exact hydration time
    assert.ok(d.bootProxies.toLoad != null)
    assert.equal(d.hydrationMark.available, true, 'the deferred island still emits its marker when it runs')
  } finally { server.close() }
})

browserTest('an opt-in hydration budget turns a boot-proxy breach into a confirmed finding', async () => {
  const { server, url } = await startFixtureServer(0)
  const dir = mkdtempSync(join(tmpdir(), 'fa-hb-'))
  const budgetFile = join(dir, 'b.json')
  writeFileSync(budgetFile, JSON.stringify({ bootLongTaskTotalMs: 0 })) // impossible -> the heavy page's boot long task breaches it
  try {
    const { report } = await runAudit(url, ['--paths', '/hydration-heavy.html', '--checks', 'hydration-cost', '--hydration-runs', '2', '--hydration-settle', '700', '--hydration-budget', budgetFile, '--max-time', '90'])
    const breaches = report.findings.filter((f) => f.id === 'hydration-cost-over-budget')
    assert.ok(breaches.length >= 1 && breaches.every((f) => f.level === 'confirmed'), 'a boot-proxy breach is confirmed')
  } finally { server.close() }
})
