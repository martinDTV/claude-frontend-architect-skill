import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const nuxt = join(fixtures, 'nuxt-app')
const next = join(fixtures, 'next-app')

test('nuxt: listener, interval and gsap tween without cleanup in one component', () => {
  const { code, report } = runTool('leak-patterns.mjs', [nuxt])
  assert.equal(code, 0, 'heuristics only')
  const modal = report.findings.filter((f) => f.file === 'app/components/crm/CrmOportunidadModal.vue')
  assert.deepEqual(modal.map((f) => f.id).sort(), ['leak-event-listener', 'leak-gsap', 'leak-interval'])
  assert.ok(modal.every((f) => f.level === 'heuristic'))
  assert.ok(modal.every((f) => f.message.includes('no unmount/dispose hook at all')))
  const listener = modal.find((f) => f.id === 'leak-event-listener')
  assert.equal(listener.line, 9, 'line is absolute in the SFC, not relative to the script block')
  assert.ok(!report.findings.some((f) => f.file === 'app/components/ui/StateLoading.vue'))
})

test('next: cleaned-up resources are not reported, an unclosed EventSource is', () => {
  const { report } = runTool('leak-patterns.mjs', [next])
  assert.ok(!report.findings.some((f) => f.file === 'src/features/orders/components/OrderFilters.tsx'))
  const stream = byId(report, 'leak-stream')
  assert.equal(stream.length, 1)
  assert.equal(stream[0].file, 'src/features/orders/hooks/useOrders.ts')
  assert.equal(stream[0].severity, 'high')
  assert.ok(!byId(report, 'leak-interval').length, 'clearInterval present')
  const row = report.data.rows.find((r) => r.file === 'src/features/orders/hooks/useOrders.ts' && r.id === 'interval')
  assert.equal(row.cleanups, 1)
})
