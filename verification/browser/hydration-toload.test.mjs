// hydration-cost toLoad regression (1.7 harness fix): the gate once failed with `toLoad null` because the navigation
// snapshot read nav.loadEventEnd before the load event handler had populated it (a race visible only under full-gate
// load; isolated reruns never reproduced it). The fix makes hydrationCostRun wait for loadEventEnd>0 before snapshotting.
// This test is deterministic and needs no browser: it (1) pins the structural guard is present in the source, and (2)
// re-implements the exact toLoad transform the snapshot uses and proves it stays HONEST — a populated value yields a
// number, a genuine 0 yields 0 (not null, reported honestly), and only a truly absent (undefined) value yields null,
// which the check then treats as an instrument miss, never a pass.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts', 'browser-audit.mjs'), 'utf8')

test('the loadEventEnd race guard is present in hydrationCostRun', () => {
  // The fix: wait for the navigation entry's loadEventEnd to be populated before snapshotting.
  assert.match(src, /waitForFunction\(\(\) => \{\s*const n = performance\.getEntriesByType\('navigation'\)\[0\];\s*return n && n\.loadEventEnd > 0;/,
    'hydrationCostRun must wait for loadEventEnd>0 before reading the navigation snapshot')
})

// The exact transform the in-page snapshot applies: t(v) = v==null ? null : max(0, v - activationStart); toLoad = t(loadEventEnd).
const tFactory = (activationStart) => (v) => (v == null ? null : Math.max(0, v - activationStart))

test('toLoad transform is honest: populated -> number, genuine 0 -> 0, absent -> null', () => {
  const t = tFactory(0)
  assert.equal(t(120), 120, 'a populated loadEventEnd becomes a real number')
  assert.equal(t(0), 0, 'a genuine 0 stays 0 (reported honestly), it is NOT turned into null')
  assert.equal(t(undefined), null, 'only a truly absent value is null — which the check treats as an instrument miss')
  assert.equal(t(null), null)
})

// The aggregation med() collapses to null only when EVERY run is null. After the wait-guard, a page that fires load
// yields numbers, so toLoad is a number. This pins that the collapse-to-null is reserved for genuine total absence.
const round1 = (x) => Math.round(x * 10) / 10
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const med = (vals) => { const xs = vals.filter((x) => x != null); return xs.length ? round1(median(xs)) : null }

test('median aggregation: any measured run yields a number; only all-null yields null', () => {
  assert.equal(med([120, 0, 130]), 120, 'a genuine 0 is a valid sample and participates')
  assert.equal(med([null, 78, null]), 78, 'one measured run is enough for a number')
  assert.equal(med([null, null, null]), null, 'null only when every run failed to measure — an instrument miss, surfaced not hidden')
})
