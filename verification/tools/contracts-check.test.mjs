import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const nuxt = join(fixtures, 'nuxt-app')
const next = join(fixtures, 'next-app')

test('nuxt: internal imports, cycles, unused exports', () => {
  const { code, report } = runTool('contracts-check.mjs', [nuxt])
  assert.equal(code, 1)
  const internal = byId(report, 'internal-import')
  assert.deepEqual(internal.map((f) => f.file).sort(), ['app/components/ui/Leaky.vue', 'app/features/billing/BillingPanel.vue'])
  assert.ok(internal.every((f) => f.level === 'confirmed'))
  const cycle = byId(report, 'module-cycle')
  assert.equal(cycle.length, 1)
  assert.match(cycle[0].message, /reports.*exports|exports.*reports/)
  const orders = report.data.modules.find((m) => m.root === 'app/features/orders')
  assert.deepEqual(orders.exports, ['Order', 'useOrders'])
  assert.deepEqual(orders.usedExports, ['useOrders'])
  assert.ok(byId(report, 'unused-public-export').some((f) => f.message.startsWith('Order ')))
  assert.equal(byId(report, 'module-without-entry').length, 0)
})

test('baseline: writing then removing an export is a breaking change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fa-contracts-'))
  const baseline = join(dir, 'contracts.json')
  const first = runTool('contracts-check.mjs', [next, '--write-baseline', baseline, '--fail-on', 'none'])
  assert.equal(first.code, 0)
  const saved = JSON.parse(readFileSync(baseline, 'utf8'))
  assert.deepEqual(saved.modules['src/features/orders'].exports, ['OrderList', 'useOrders'])
  // simulate a rename in the baseline so the current tree looks like it lost an export
  saved.modules['src/features/orders'].exports.push('cancelOrder')
  writeFileSync(baseline, JSON.stringify(saved))
  const second = runTool('contracts-check.mjs', [next, '--baseline', baseline])
  assert.equal(second.code, 1)
  const breaking = byId(second.report, 'breaking-change')
  assert.equal(breaking.length, 1)
  assert.match(breaking[0].message, /cancelOrder/)
})

test('--modules-dir overrides module discovery', () => {
  const { report } = runTool('contracts-check.mjs', [nuxt, '--modules-dir', 'app/components', '--fail-on', 'none'])
  assert.ok(report.data.modules.some((m) => m.root === 'app/components/crm'))
  assert.ok(byId(report, 'module-without-entry').some((f) => f.file === 'app/components/crm'), 'folders without index.ts used by outsiders')
  const implicit = byId(report, 'implicit-cross-module-dependency')
  assert.ok(implicit.some((f) => f.file === 'app/layouts/default.vue' && f.message.includes('CrmBadge')), 'template component use is an implicit dependency')
})

test('nuxt: feature modules used only through imports have no implicit dependencies', () => {
  const { report } = runTool('contracts-check.mjs', [nuxt, '--fail-on', 'none'])
  assert.equal(byId(report, 'implicit-cross-module-dependency').length, 0)
})
