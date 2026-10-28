import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const nuxt = join(fixtures, 'nuxt-app')
const next = join(fixtures, 'next-app')

test('nuxt: measures the generated god page and ranks it first', () => {
  const { code, report } = runTool('component-complexity.mjs', [nuxt, '--threshold-lines', '300'])
  assert.equal(code, 0, 'heuristic-only tool exits 0 with the default --fail-on confirmed')
  const [first] = report.data.components
  assert.equal(first.file, 'app/pages/big/index.vue')
  assert.ok(first.lines > 300)
  assert.equal(first.modals, 12)
  assert.equal(first.watchers, 8)
  assert.ok(first.httpCalls >= 9, `http calls counted: ${first.httpCalls}`)
  assert.deepEqual(first.composables, ['useCrm', 'usePersonas', 'usePlanos'])
  assert.deepEqual(first.stores, ['useAuthStore'])
  assert.ok(first.flags.includes('data-access') && first.flags.includes('form') && first.flags.includes('table') && first.flags.includes('modals'))
  assert.ok(first.page)
  const oversized = byId(report, 'oversized-component')
  assert.equal(oversized.length, 1)
  assert.equal(oversized[0].level, 'heuristic')
  assert.ok(byId(report, 'mixed-responsibilities').some((f) => f.file === 'app/pages/big/index.vue'))
  assert.ok(byId(report, 'page-talks-to-network').some((f) => f.file === 'app/pages/big/index.vue'))
  assert.ok(byId(report, 'watcher-chains').some((f) => f.file === 'app/pages/big/index.vue'))
})

test('nuxt: small components produce no findings and template-only components count', () => {
  const { report } = runTool('component-complexity.mjs', [nuxt])
  assert.equal(byId(report, 'oversized-component').length, 0, 'default threshold 400 is above the fixture page')
  const loading = report.data.components.find((c) => c.file === 'app/components/ui/StateLoading.vue')
  assert.ok(loading)
  assert.equal(loading.scriptLines, 0)
  const modal = report.data.components.find((c) => c.file === 'app/components/crm/CrmOportunidadModal.vue')
  assert.ok(modal.flags.includes('realtime'), 'setInterval marks realtime')
})

test('next: detects TSX components, skips plain modules', () => {
  const { report } = runTool('component-complexity.mjs', [next])
  const files = report.data.components.map((c) => c.file)
  assert.ok(files.includes('src/app/(dashboard)/orders/page.tsx'))
  assert.ok(files.includes('src/features/orders/components/OrderFilters.tsx'))
  assert.ok(!files.includes('src/features/orders/orders.actions.ts'))
  assert.ok(!files.includes('src/lib/http/client.ts'))
  const filters = report.data.components.find((c) => c.file === 'src/features/orders/components/OrderFilters.tsx')
  assert.equal(filters.watchers, 1)
  assert.equal(filters.state, 1)
})
