// Vitals check (1.6 increment 2): lab Core Web Vitals in browser-audit. Two layers:
//  (1) an observer-behaviour test with no browser — the injected observer is evaluated against a mock
//      PerformanceObserver fed synthetic entries, so the CLS session-window algorithm and the recent-input
//      exclusion are checked deterministically, independent of any machine's timings;
//  (2) a gated real-Chromium integration test — availability flags, aggregate structure, the additive JSON and
//      the info finding, asserting behaviour and availability, never exact milliseconds.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import { startFixtureServer } from './fixture/server.mjs'
import { VITALS_OBSERVER } from '../../plugins/frontend-architect/skills/frontend-architect/scripts/browser-audit.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const tool = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts', 'browser-audit.mjs')

// --- layer 1: evaluate the real injected observer against a mock PerformanceObserver -----------------------
function runObserverWith(layoutShiftEntries, extra = {}) {
  const observers = []
  const win = {
    addEventListener() {},
    PerformanceObserver: class {
      constructor(cb) { this.cb = cb }
      observe({ type }) { observers.push({ type, cb: this.cb }) }
      static supportedEntryTypes = ['largest-contentful-paint', 'layout-shift', 'paint', 'longtask']
    },
  }
  const ctx = vm.createContext({ window: win, PerformanceObserver: win.PerformanceObserver, addEventListener: win.addEventListener, performance: { now: () => 0 } })
  vm.runInContext(VITALS_OBSERVER, ctx)
  const ls = observers.find((o) => o.type === 'layout-shift')
  assert.ok(ls, 'the observer subscribes to layout-shift')
  ls.cb({ getEntries: () => layoutShiftEntries })
  return win.__vitals
}

test('CLS uses the session-window maximum, not the sum of all shifts', () => {
  // burst A within a window sums to 0.30; burst B starts after a >1s gap and sums to 0.10.
  const v = runObserverWith([
    { value: 0.15, startTime: 100, hadRecentInput: false },
    { value: 0.15, startTime: 300, hadRecentInput: false }, // same session -> 0.30
    { value: 0.05, startTime: 2000, hadRecentInput: false }, // gap > 1s -> new session
    { value: 0.05, startTime: 2200, hadRecentInput: false }, // -> 0.10
  ])
  assert.equal(Math.round(v.cls * 100) / 100, 0.30, 'CLS is the max session (0.30), not the sum (0.40)')
})

test('CLS excludes shifts that follow recent input (hadRecentInput)', () => {
  const v = runObserverWith([
    { value: 0.20, startTime: 100, hadRecentInput: true },  // excluded
    { value: 0.05, startTime: 300, hadRecentInput: false }, // counted
  ])
  assert.equal(Math.round(v.cls * 100) / 100, 0.05)
})

test('CLS of a page with no shifts is 0 and available, never missing', () => {
  const v = runObserverWith([])
  assert.equal(v.cls, 0)
  assert.equal(v.support['layout-shift'], true)
})

test('an unsupported entry type is marked unavailable, not zero', () => {
  // a context whose PerformanceObserver supports nothing
  const win = { addEventListener() {}, PerformanceObserver: class { constructor(cb) { this.cb = cb } observe() {} static supportedEntryTypes = [] } }
  const ctx = vm.createContext({ window: win, PerformanceObserver: win.PerformanceObserver, addEventListener: win.addEventListener, performance: { now: () => 0 } })
  vm.runInContext(VITALS_OBSERVER, ctx)
  assert.equal(win.__vitals.support['layout-shift'], false)
  assert.equal(win.__vitals.support['largest-contentful-paint'], false)
})

// --- layer 2: real Chromium, availability and structure (gated; skipped without Playwright) ----------------
const required = process.env.FA_REQUIRE_BROWSER === '1'
const availability = (() => {
  const probe = spawnSync(process.execPath, ['-e', "const {chromium}=require('playwright');chromium.launch({headless:true}).then(b=>b.close().then(()=>console.log('ok')),e=>{console.error(e.message.split('\\n')[0]);process.exit(1)})"], { cwd: here, encoding: 'utf8', timeout: 60000 })
  return probe.status === 0 ? { ok: true } : { ok: false, reason: `playwright/chromium not available: ${(probe.stderr || '').trim().split('\n')[0]}` }
})()
const browserTest = (name, fn) => test(name, { skip: availability.ok || required ? false : availability.reason }, fn)

function runAudit(url, extra = []) {
  const out = mkdtempSync(join(tmpdir(), 'fa-vitals-'))
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tool, url, '--playwright', here, '--out', out, '--json', '--fail-on', 'none', ...extra], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', (d) => (stdout += d)); child.stderr.on('data', (d) => (stderr += d))
    child.on('close', () => { try { resolve({ report: JSON.parse(stdout), out }) } catch (e) { reject(new Error(`no JSON: ${stderr.slice(0, 300)}`)) } })
  })
}
const vitalsOf = (report, path) => report.data.pages.find((p) => new URL(p.url).pathname === path)?.checks.vitals

browserTest('vitals measures CWV on the fixtures: availability and structure, not exact milliseconds', async () => {
  const { server, url } = await startFixtureServer(0)
  try {
    const paths = ['/vitals-lcp.html', '/vitals-clean.html', '/vitals-cls.html']
    const { report } = await runAudit(url, ['--paths', paths.join(','), '--checks', 'vitals', '--vitals-runs', '3', '--vitals-settle', '700', '--max-time', '120'])
    // config is recorded additively and labelled lab
    assert.equal(report.analysis.vitals.runs, 3)
    assert.equal(report.analysis.vitals.budget, 'none (diagnostic only; does not fail CI)')
    // LCP page: LCP, FCP, TTFB available; a long task reported
    const lcp = vitalsOf(report, '/vitals-lcp.html')
    assert.ok(lcp, 'vitals recorded for the LCP page')
    assert.equal(lcp.aggregate.lcp.origin, 'lab')
    assert.equal(lcp.aggregate.lcp.type, 'core-web-vital')
    assert.ok(lcp.aggregate.lcp.available && lcp.aggregate.lcp.p75 > 0, 'LCP available and positive')
    assert.ok(lcp.aggregate.ttfb.available && lcp.aggregate.ttfb.p75 != null, 'TTFB available')
    assert.ok(lcp.aggregate.fcp.available, 'FCP available')
    assert.ok(lcp.aggregate.longTasks.available && lcp.aggregate.longTasks.countMedian >= 1, 'the deliberate long task is reported')
    assert.equal(lcp.aggregate.longTasks.type, 'diagnostic')
    assert.equal(lcp.perRun.length, lcp.completedRuns)
    // clean page: CLS available and 0 (not missing), no long task
    const clean = vitalsOf(report, '/vitals-clean.html')
    assert.ok(clean.aggregate.cls.available, 'CLS available on a stable page')
    assert.equal(clean.aggregate.cls.p75, 0, 'a stable page has CLS 0, reported, not missing')
    // CLS page: a shift was induced -> CLS available and > 0
    const cls = vitalsOf(report, '/vitals-cls.html')
    assert.ok(cls.aggregate.cls.available && cls.aggregate.cls.p75 > 0, 'induced shift measured')
    // the info finding summarises the page and names the measurement caveat; it never fails CI
    const info = report.findings.filter((f) => f.id === 'vitals-measured')
    assert.ok(info.length >= 1 && info.every((f) => f.level === 'info'))
    assert.ok(info.some((f) => /lab numbers under a fixed profile, not field percentiles/.test(f.fix)))
    assert.ok(!report.findings.some((f) => f.level === 'confirmed'), 'no budget -> no confirmed finding -> no CI failure')
  } finally { server.close() }
})

browserTest('an opt-in budget turns a measured p75 breach into a confirmed finding', async () => {
  const { server, url } = await startFixtureServer(0)
  const budget = mkdtempSync(join(tmpdir(), 'fa-vb-'))
  const budgetFile = join(budget, 'b.json')
  writeFileSyncSafe(budgetFile, JSON.stringify({ lcp: 0, cls: -1 })) // impossible budgets -> guaranteed breach
  try {
    const { report } = await runAudit(url, ['--paths', '/vitals-lcp.html', '--checks', 'vitals', '--vitals-runs', '2', '--vitals-settle', '600', '--vitals-budget', budgetFile, '--max-time', '90'])
    const breaches = report.findings.filter((f) => f.id === 'vitals-over-budget')
    assert.ok(breaches.length >= 1 && breaches.every((f) => f.level === 'confirmed'), 'a p75 over the opt-in budget is confirmed')
    assert.ok(breaches.some((f) => /exceeds the budget/.test(f.message)))
  } finally { server.close() }
})

import { writeFileSync as writeFileSyncSafe } from 'node:fs'
