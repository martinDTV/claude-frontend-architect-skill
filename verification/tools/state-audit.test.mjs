import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const nuxt = join(fixtures, 'nuxt-app')
const next = join(fixtures, 'next-app')

test('nuxt: tokens in localStorage and a module-level client with mutable auth are confirmed', () => {
  const { code, report } = runTool('state-audit.mjs', [nuxt])
  assert.equal(code, 1)
  const tokens = byId(report, 'token-in-web-storage')
  assert.equal(tokens.length, 2)
  assert.ok(tokens.every((f) => f.level === 'confirmed' && f.file === 'app/stores/auth.ts'))
  assert.ok(tokens.some((f) => f.message.includes("'nexus:access'")))
  const client = byId(report, 'module-level-http-client-mutable-auth')
  assert.equal(client.length, 1)
  assert.equal(client[0].file, 'app/composables/useApi.ts')
  assert.equal(client[0].level, 'confirmed')
  assert.equal(client[0].severity, 'critical', 'ssr is on in the fixture')
  // the plugin creates its instance inside defineNuxtPlugin: not module-level
  assert.ok(!report.findings.some((f) => f.file === 'app/plugins/api.ts'))
})

test('nuxt: module-level containers and let bindings are heuristic; stores are inventoried', () => {
  const { report } = runTool('state-audit.mjs', [nuxt, '--fail-on', 'none'])
  const mod = byId(report, 'module-level-mutable-state')
  assert.ok(mod.some((f) => f.file === 'app/composables/useSales.ts' && f.message.includes('"cache"')))
  assert.ok(mod.some((f) => f.file === 'app/composables/catalog/useCatalogTree.ts' && f.message.includes('"enVuelo"')))
  assert.ok(mod.every((f) => f.level === 'heuristic'))
  const stores = report.data.stores
  assert.deepEqual(stores.map((s) => s.id).sort(), ['auth', 'sales', 'ui'])
  const auth = stores.find((s) => s.id === 'auth')
  assert.equal(auth.persist, 'all')
  assert.ok(auth.consumers >= 4, `auth store consumers via auto-import: ${auth.consumers}`)
  const persisted = byId(report, 'store-persists-everything')
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].severity, 'high', 'holds tokens')
  assert.equal(byId(report, 'logout-without-cache-clear').length, 0, 'logout calls clearNuxtState')
  assert.deepEqual(report.data.stateKeys.map((k) => k.key).sort(), ['catalog-tree', 'flags-permissions', 'people:directory'])
  assert.equal(byId(report, 'raw-state-key-shared').length, 0, 'each key lives in one composable')
})

test('next: module-level axios with setToken is confirmed; zustand store is info only', () => {
  const { code, report } = runTool('state-audit.mjs', [next])
  assert.equal(code, 1)
  const client = byId(report, 'module-level-http-client-mutable-auth')
  assert.equal(client.length, 1)
  assert.equal(client[0].file, 'src/lib/http/client.ts')
  const zustand = byId(report, 'module-level-client-store')
  assert.equal(zustand.length, 1)
  assert.equal(zustand[0].level, 'info')
  assert.equal(byId(report, 'token-in-web-storage').length, 0)
  assert.equal(report.data.stateKeys.length, 0, 'React useState is not a keyed store')
})

test('nuxt: server data copied from a query into a store is reported once, with both lines; client-owned writes are not', () => {
  const { report } = runTool('state-audit.mjs', [nuxt, '--fail-on', 'none'])
  const copies = byId(report, 'server-data-copied-to-store')
  assert.equal(copies.length, 1)
  const [copy] = copies
  assert.equal(copy.file, 'app/components/sales/SalesSync.vue')
  assert.equal(copy.level, 'heuristic')
  assert.match(copy.evidence, /fetch at line \d+; write at line \d+: if \(data\) salesStore\.leads = data/)
  assert.equal(copy.line, 8, 'line is absolute in the SFC')
  // a literal flag written around a fetch, and a store write without any fetch, are not copies
  assert.ok(!report.findings.some((f) => f.file === 'app/components/sales/SalesQuickAdd.vue' && f.id === 'server-data-copied-to-store'))
  assert.ok(!report.findings.some((f) => f.file === 'app/components/ui/DensityToggle.vue' && f.id === 'server-data-copied-to-store'))
  // the store definition itself (which may hold arrays) is covered by server-data-in-store, not by this rule
  assert.ok(!copies.some((f) => f.file.startsWith('app/stores/')))
})
