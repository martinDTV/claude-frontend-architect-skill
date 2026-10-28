import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
import { byId, fixtures, runTool } from './helpers.mjs'

const nuxt = join(fixtures, 'nuxt-app')
const next = join(fixtures, 'next-app')

test('nuxt: resolves auto-imported composables, stores, nested imports.dirs and template components', () => {
  const { code, report } = runTool('domain-deps.mjs', [nuxt, '--fail-on', 'none'])
  assert.equal(code, 0)
  assert.equal(report.framework, 'nuxt')
  const edges = report.data.edges
  const has = (from, to, via) => edges.some((e) => e.from === from && e.to === to && (!via || e.via === via))
  // composable auto-imported in a page (no import statement)
  assert.ok(has('app/pages/index.vue', 'app/composables/useCrm.ts', 'auto-import'))
  // nested dir registered through imports.dirs
  assert.ok(has('app/pages/obra/[id].vue', 'app/composables/catalogos/useCatalogoWbs.ts', 'auto-import'))
  // Pinia store from app/stores auto-imported by @pinia/nuxt
  assert.ok(has('app/middleware/auth.ts', 'app/stores/auth.ts', 'auto-import'))
  // component used in a template, named with Nuxt's path-prefix rule (components/crm/CrmBadge.vue -> CrmBadge)
  assert.ok(has('app/layouts/default.vue', 'app/components/crm/CrmBadge.vue', 'component'))
  // pathPrefix: false dir: <AppHeader> resolves to components/shell/AppHeader.vue
  assert.ok(has('app/layouts/default.vue', 'app/components/shell/AppHeader.vue', 'component'))
  // explicit import with ~ alias
  assert.ok(has('app/pages/obra/[id].vue', 'app/types/crm.ts', 'import'))
  // a file never gets an auto-import edge to itself or for names it declares
  assert.ok(!edges.some((e) => e.from === e.to))
  // test files are excluded by default
  assert.ok(!edges.some((e) => e.from.startsWith('tests/')))
})

test('nuxt: reports boundary findings with the right levels', () => {
  const { code, report } = runTool('domain-deps.mjs', [nuxt])
  assert.equal(code, 1, 'confirmed findings exit 1 by default')
  const shared = byId(report, 'shared-imports-domain')
  assert.equal(shared.length, 1)
  assert.equal(shared[0].level, 'confirmed')
  assert.equal(shared[0].file, 'app/components/ui/Leaky.vue')
  const internal = byId(report, 'feature-internal-import')
  assert.deepEqual(internal.map((f) => f.file).sort(), ['app/components/ui/Leaky.vue', 'app/features/billing/BillingPanel.vue'])
  // importing through the module's index.ts is not a violation
  assert.ok(!internal.some((f) => f.message.includes("'~/features/orders'")))
  const shell = byId(report, 'shell-depends-on-domain')
  assert.ok(shell.every((f) => f.level === 'heuristic'), 'auto-import edges are heuristic')
  assert.ok(shell.some((f) => f.file === 'app/middleware/auth.ts' && f.message.includes('useSettingComercial')))
  assert.ok(shell.some((f) => f.file === 'app/layouts/default.vue' && f.message.includes('CrmBadge')))
})

test('nuxt: matrix and horizontal pairs use the config classification', () => {
  const { report } = runTool('domain-deps.mjs', [nuxt, '--fail-on', 'none'])
  assert.equal(report.config, '.frontend-audit.json')
  assert.ok(report.data.businessDomains.includes('crm'))
  const obraCrm = report.data.pairs.find((p) => p.from === 'obra' && p.to === 'crm')
  assert.ok(obraCrm, 'obra -> crm coupling detected')
  assert.equal(obraCrm.files, 2)
  assert.ok(obraCrm.targets.some((t) => t.file === 'app/composables/useCrm.ts' && t.via.includes('auto-import')))
  assert.equal(report.data.matrix.shared.orders, 1)
  const unclassified = byId(report, 'unclassified-files')
  assert.equal(unclassified.length, 1)
  assert.match(unclassified[0].evidence, /app\/stores\/auth\.ts/)
})

test('nuxt: --no-auto-imports keeps only explicit imports and components', () => {
  const { report } = runTool('domain-deps.mjs', [nuxt, '--no-auto-imports', '--fail-on', 'none'])
  assert.ok(!report.data.edges.some((e) => e.via === 'auto-import'))
  assert.ok(!report.data.edges.some((e) => e.via === 'component'), 'component resolution needs the catalog')
  assert.ok(report.data.edges.some((e) => e.via === 'import'))
})

test('next: classifies App Router segments and features without a config file', () => {
  const { code, report } = runTool('domain-deps.mjs', [next])
  assert.equal(code, 1)
  assert.equal(report.framework, 'next')
  assert.equal(report.config, null)
  assert.equal(report.summary.autoImportSymbols, 0)
  assert.ok(report.data.businessDomains.includes('orders'))
  assert.ok(report.data.businessDomains.includes('billing'))
  const internal = byId(report, 'feature-internal-import')
  assert.equal(internal.length, 1)
  assert.equal(internal[0].file, 'src/app/(dashboard)/orders/page.tsx')
  assert.match(internal[0].message, /features\/billing\/internal\/calc/)
  const shared = byId(report, 'shared-imports-domain')
  assert.equal(shared.length, 1)
  assert.equal(shared[0].file, 'src/components/ui/button.tsx')
  assert.equal(shared[0].level, 'confirmed')
  // route group folders do not become domains
  assert.ok(!report.data.domains.includes('(dashboard)'))
})

test('--config accepts an absolute path outside the project (audits keep the classification in /tmp)', () => {
  const { mkdtempSync, writeFileSync, readFileSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'fa-config-'))
  const cfg = join(dir, 'audit.json')
  writeFileSync(cfg, readFileSync(join(nuxt, '.frontend-audit.json')))
  const { code, report } = runTool('domain-deps.mjs', [nuxt, '--config', cfg, '--fail-on', 'none'])
  assert.equal(code, 0)
  assert.ok(report.config.endsWith('audit.json'))
  assert.ok(report.data.businessDomains.includes('crm'))
})

test('usage and errors', () => {
  const help = runTool('domain-deps.mjs', ['--help'], { parse: false })
  assert.equal(help.code, 0)
  assert.match(help.stdout, /usage: node domain-deps\.mjs/)
  const missing = runTool('domain-deps.mjs', ['/nonexistent/path'], { parse: false })
  assert.equal(missing.code, 2)
})
