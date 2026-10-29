// Symbol-level resolution through barrels (1.3): origins of named imports, derived edges with
// --follow-reexports, and the contract rule for barrels that publish code they do not own.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const tsPaths = join(fixtures, 'ts-paths')
const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]
const truth = JSON.parse(readFileSync(join(tsPaths, 'expected-symbols.json'), 'utf8'))
const originKey = (o) => `${o.from} | ${o.specifier} | ${o.name} -> ${o.file} ${o.kind} hops=${o.hops} star=${o.viaStar}`

test('ts-paths: every named import resolves to the file that declares it, with the expected barrel hops', () => {
  const { report } = runTool('domain-deps.mjs', [tsPaths, ...semantic, '--fail-on', 'none'])
  const found = []
  for (const e of report.data.edges) for (const o of e.origins ?? []) found.push({ from: e.from, specifier: e.specifier, name: o.name, file: o.file, kind: o.kind, hops: o.hops, viaStar: o.viaStar, status: o.status })
  assert.ok(found.every((o) => o.status === 'declared'), `unexpected statuses: ${JSON.stringify(found.filter((o) => o.status !== 'declared'))}`)
  const want = new Set(truth.origins.map(originKey))
  const got = new Set(found.map(originKey))
  assert.deepEqual([...want].filter((k) => !got.has(k)), [], 'origins missing')
  assert.deepEqual([...got].filter((k) => !want.has(k)), [], 'origins not in the ground truth')
  const s = report.summary.symbolResolution
  assert.equal(s.names, truth.origins.length)
  assert.equal(s.declared, truth.origins.length)
  assert.equal(s.viaBarrel, truth.origins.filter((o) => o.hops > 0).length)
  assert.equal(s.viaStar, truth.origins.filter((o) => o.viaStar).length)
  assert.equal(s.notFound + s.external + s.unknown + s.cycle, 0)
  // default behaviour unchanged: 19 edges, no derived ones
  assert.equal(report.summary.edges, 19)
  assert.equal(report.summary.derivedEdges, 0)
})

test('ts-paths: --follow-reexports adds importer → declaring-file edges through barrels and nothing else', () => {
  const { report } = runTool('domain-deps.mjs', [tsPaths, ...semantic, '--follow-reexports', '--fail-on', 'none'])
  const derived = report.data.edges.filter((e) => e.via === 'reexport')
  const key = (e) => `${e.from} -> ${e.to} [${e.kind}] via ${e.through}`
  assert.deepEqual(derived.map(key).sort(), truth.derivedEdgesWithFollowReexports.map(key).sort())
  assert.ok(derived.every((e) => e.resolution === 'syntax-reexport' && e.confidence === 'verified' && e.hops === 1))
  assert.equal(report.summary.edges, 19 + derived.length)
  assert.equal(report.summary.derivedEdges, derived.length)
  assert.ok(report.notes.some((n) => /derived edge\(s\) added by --follow-reexports/.test(n)))
  // the derived type edge from a shared component into the orders domain is reported with low severity (type-only)
  const viaTypes = byId(report, 'shared-imports-domain').filter((f) => f.file === 'src/components/StatusBadge.vue')
  assert.ok(viaTypes.length >= 1 && viaTypes.every((f) => f.severity === 'low'))
})

test('lexical engine: no origins, and --follow-reexports is declined with a note instead of failing', () => {
  const { code, report } = runTool('domain-deps.mjs', [tsPaths, '--engine', 'lexical', '--follow-reexports', '--fail-on', 'none'])
  assert.equal(code, 0)
  assert.equal(report.summary.symbolResolution, null)
  assert.equal(report.summary.derivedEdges, 0)
  assert.ok(report.data.edges.every((e) => !e.origins))
  assert.ok(report.notes.some((n) => /needs the semantic engine/.test(n)))
})

test('contracts-check: a barrel that only re-exports its own files raises no cross-module finding', () => {
  const { report } = runTool('contracts-check.mjs', [tsPaths, ...semantic, '--modules-dir', 'src/core', '--fail-on', 'none'])
  assert.equal(byId(report, 'reexport-crosses-module').length, 0)
  const orders = report.data.modules.find((m) => m.root === 'src/core/orders')
  assert.deepEqual(orders.exportOrigins.priceWithTax, { status: 'declared', file: 'src/core/orders/internal/pricing.ts', hops: 1 })
  assert.deepEqual(orders.exportOrigins.Order, { status: 'declared', file: 'src/core/orders/types.ts', hops: 1 })
})
