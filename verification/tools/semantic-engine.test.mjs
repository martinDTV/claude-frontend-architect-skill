import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool, scriptsDir } from './helpers.mjs'

const tsPaths = join(fixtures, 'ts-paths')
const nuxt = join(fixtures, 'nuxt-app')
const next = join(fixtures, 'next-app')
// the fixtures ship no node_modules: the verification vue project provides typescript 5.9 and vue/compiler-sfc
const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]

const edgeKey = (e) => `${e.from} -> ${e.to} [${e.kind}]`

test('ts-paths: the semantic engine reproduces the ground truth exactly (precision and recall 1)', () => {
  const { code, report } = runTool('domain-deps.mjs', [tsPaths, ...semantic, '--fail-on', 'none'])
  assert.equal(code, 0, report?.notes?.join('\n'))
  assert.equal(report.summary.engine, 'semantic')
  assert.equal(report.data.analysis.typescript.source, 'override')
  const expected = JSON.parse(readFileSync(join(tsPaths, 'expected-edges.json'), 'utf8'))
  const found = new Set(report.data.edges.map(edgeKey))
  const want = new Set(expected.edges.map(edgeKey))
  const missing = [...want].filter((k) => !found.has(k))
  const extra = [...found].filter((k) => !want.has(k))
  assert.deepEqual(missing, [], 'false negatives')
  assert.deepEqual(extra, [], 'false positives')
  assert.ok(report.data.edges.every((e) => e.confidence === 'verified'))
  assert.deepEqual(report.summary.edgesByDependencyKind, { type: 7, runtime: 12 })
  // unresolved: the non-literal dynamic import and the missing file; declared packages are not unresolved
  assert.deepEqual(report.data.unknownImports.map((u) => [u.specifier, u.reason]).sort(), [[null, 'non-literal specifier'], ['./does-not-exist', 'file not found']].sort())
  assert.deepEqual(report.data.packageImports.map((p) => p.name).sort(), ['vue', 'zod'])
  // runtime cycle billing <> checkout is reported; type-only coupling lowers severity
  const cycles = byId(report, 'domain-cycle')
  assert.equal(cycles.length, 1)
  assert.match(cycles[0].message, /billing|checkout/)
  const sharedToDomain = byId(report, 'shared-imports-domain')
  assert.ok(sharedToDomain.some((f) => f.file === 'src/components/OrderCard.vue' && f.severity === 'high' && f.message.includes('checkout')), 'runtime import from shared component')
  assert.ok(sharedToDomain.some((f) => f.file === 'src/components/StatusBadge.vue' && f.severity === 'low' && f.message.includes('type-only')), 'type-only import lowers severity')
})

test('ts-paths: the lexical engine misses alias and barrel edges that the semantic engine resolves', () => {
  const { report } = runTool('domain-deps.mjs', [tsPaths, '--engine', 'lexical', '--fail-on', 'none'])
  assert.equal(report.summary.engine, 'lexical')
  const found = new Set(report.data.edges.map(edgeKey))
  // #core/* and #ui aliases exist only in tsconfig paths: the lexical engine cannot resolve them
  assert.ok(!found.has('src/features/checkout/total.ts -> src/core/orders/internal/pricing.ts [runtime]'))
  assert.ok(!found.has('src/features/reports/report.ts -> src/shared/ui/index.ts [runtime]'))
  // but relative and @/ imports are still found
  assert.ok(found.has('src/components/OrderCard.vue -> src/components/StatusBadge.vue [runtime]'))
  assert.ok(found.has('src/core/billing/invoice.ts -> src/features/checkout/label.ts [runtime]'))
})

test('engine selection: auto falls back to lexical with a reason; semantic without TypeScript exits 2', () => {
  const auto = runTool('domain-deps.mjs', [tsPaths, '--fail-on', 'none'])
  assert.equal(auto.report.summary.engine, 'lexical')
  assert.equal(auto.report.data.analysis.requested, 'auto')
  assert.match(auto.report.data.analysis.reason, /typescript not resolvable/)
  const forced = runTool('domain-deps.mjs', [tsPaths, '--engine', 'semantic'], { parse: false })
  assert.equal(forced.code, 2)
  assert.match(forced.stderr, /semantic engine requested but unavailable/)
  const bad = runTool('domain-deps.mjs', [tsPaths, '--engine', 'quantum'], { parse: false })
  assert.equal(bad.code, 2)
})

test('engine selection: a TypeScript without the JavaScript API (TypeScript 7 shape) is rejected with a clear reason', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fa-ts7-'))
  mkdirSync(join(dir, 'node_modules', 'typescript', 'lib'), { recursive: true })
  writeFileSync(join(dir, 'node_modules', 'typescript', 'package.json'), JSON.stringify({ name: 'typescript', version: '7.0.2', main: 'lib/typescript.js' }))
  writeFileSync(join(dir, 'node_modules', 'typescript', 'lib', 'typescript.js'), 'module.exports = { version: "7.0.2" }\n')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'host' }))
  const r = runTool('domain-deps.mjs', [tsPaths, '--typescript', dir, '--fail-on', 'none'])
  assert.equal(r.report.summary.engine, 'lexical')
  assert.match(r.report.data.analysis.reason, /lacks the JavaScript compiler API/)
  assert.match(r.report.data.analysis.reason, /7\.0\.2/)
})

test('nuxt fixture: tsconfig paths resolve ~ aliases as verified; auto-imports stay inferred without .nuxt metadata', () => {
  const { report } = runTool('domain-deps.mjs', [nuxt, ...semantic, '--fail-on', 'none'])
  assert.equal(report.summary.engine, 'semantic')
  const leaky = report.data.edges.find((e) => e.from === 'app/components/ui/Leaky.vue' && e.to === 'app/features/orders/internal.ts')
  assert.ok(leaky)
  assert.equal(leaky.resolution, 'typescript')
  assert.equal(leaky.confidence, 'verified')
  const auto = report.data.edges.find((e) => e.from === 'app/pages/index.vue' && e.to === 'app/composables/useCrm.ts')
  assert.ok(auto)
  assert.equal(auto.via, 'auto-import')
  assert.equal(auto.confidence, 'inferred')
  assert.equal(auto.resolution, 'lexical-catalog')
  // template components resolved from the SFC AST, not from regexes
  const badge = report.data.edges.find((e) => e.from === 'app/layouts/default.vue' && e.to === 'app/components/crm/CrmBadge.vue')
  assert.ok(badge)
  assert.equal(badge.via, 'component')
  // the v1.1 findings are unchanged in substance
  assert.equal(byId(report, 'feature-internal-import').length, 2)
  assert.equal(byId(report, 'shared-imports-domain').filter((f) => f.level === 'confirmed').length, 1)
  assert.equal(report.data.analysis.fallbacks.length, 0, JSON.stringify(report.data.analysis.fallbacks))
})

test('nuxt fixture with .nuxt metadata: semantic auto-import edges become verified and findings confirmed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fa-nuxt-sem-'))
  cpSync(nuxt, dir, { recursive: true })
  mkdirSync(join(dir, '.nuxt', 'types'), { recursive: true })
  writeFileSync(join(dir, '.nuxt', 'types', 'imports.d.ts'), `// Generated by auto imports\nexport {}\ndeclare global {\n  const useCrm: typeof import('../../app/composables/useCrm').useCrm\n  const useSettingComercial: typeof import('../../app/composables/useSettingComercial').useSettingComercial\n  const useAuthStore: typeof import('../../app/stores/auth').useAuthStore\n}\n`)
  writeFileSync(join(dir, '.nuxt', 'components.d.ts'), `export const CrmBadge: typeof import("../app/components/crm/CrmBadge.vue")['default']\nexport const LazyCrmBadge: LazyComponent<typeof import("../app/components/crm/CrmBadge.vue")['default']>\n`)
  const { report } = runTool('domain-deps.mjs', [dir, ...semantic, '--fail-on', 'none'])
  const auto = report.data.edges.find((e) => e.from === 'app/pages/index.vue' && e.to === 'app/composables/useCrm.ts')
  assert.equal(auto.confidence, 'verified')
  assert.equal(auto.resolution, 'nuxt-metadata')
  assert.ok(byId(report, 'shell-depends-on-domain').some((f) => f.level === 'confirmed' && f.file === 'app/middleware/auth.ts'))
})

test('next fixture: server-only code reachable from client modules, env reads, directives from the AST', () => {
  const { code, report } = runTool('domain-deps.mjs', [next, ...semantic])
  assert.equal(code, 1)
  const so = byId(report, 'server-only-in-client')
  assert.equal(so.length, 1)
  assert.equal(so[0].file, 'src/features/orders/components/OrderAdminPanel.tsx')
  assert.equal(so[0].level, 'confirmed')
  assert.match(so[0].message, /server\.ts/)
  const env = byId(report, 'server-env-in-client')
  assert.ok(env.some((f) => f.file === 'src/features/orders/components/OrderAdminPanel.tsx' && f.message.includes('STRIPE_SECRET_KEY')))
  assert.ok(!report.findings.some((f) => f.file === 'src/features/orders/components/OrderBadge.tsx'), 'a client component importing a pure helper is not reported')
  // type-only import of ReactNode is a type edge to a package, never an unresolved import
  assert.ok(!report.data.unknownImports.some((u) => u.specifier === 'react'))
  // routes-audit reads directives from the AST under the semantic engine and agrees with the lexical result
  const sem = runTool('routes-audit.mjs', [next, ...semantic, '--fail-on', 'none'])
  const lex = runTool('routes-audit.mjs', [next, '--engine', 'lexical', '--fail-on', 'none'])
  assert.equal(sem.report.analysis.engine, 'semantic')
  assert.deepEqual(sem.report.data.actions, lex.report.data.actions)
  assert.deepEqual(byId(sem.report, 'client-boundary-too-high').map((f) => f.file), byId(lex.report, 'client-boundary-too-high').map((f) => f.file))
})

test('component-complexity: SFC metrics come from compiler-sfc bindings and the template AST', () => {
  const sem = runTool('component-complexity.mjs', [tsPaths, ...semantic, '--fail-on', 'none'])
  const card = sem.report.data.components.find((c) => c.file === 'src/components/OrderCard.vue')
  assert.equal(card.metricsSource, 'ast')
  assert.equal(card.props, 1)
  assert.equal(card.emits, 1)
  assert.equal(card.state, 1, 'one ref')
  assert.equal(card.computed, 1)
  assert.equal(card.lifecycleHooks, 2)
  assert.equal(card.componentsUsed, 1)
  assert.ok(card.templateDepth >= 2)
  const lex = runTool('component-complexity.mjs', [tsPaths, '--engine', 'lexical', '--fail-on', 'none'])
  assert.equal(lex.report.data.components.find((c) => c.file === 'src/components/OrderCard.vue').metricsSource, 'lexical')
})

test('leak-patterns: with the AST a listener removed in onBeforeUnmount is not a leak and the hook detection is AST-based', () => {
  const { report } = runTool('leak-patterns.mjs', [tsPaths, ...semantic, '--fail-on', 'none'])
  assert.ok(!report.findings.some((f) => f.file === 'src/components/OrderCard.vue'))
  const row = report.data.rows.find((r) => r.file === 'src/components/OrderCard.vue' && r.id === 'event-listener')
  assert.ok(row)
  assert.equal(row.cleanups, 1)
  assert.equal(row.hasCleanupHook, true)
  assert.equal(row.cleanupSource, 'ast')
})

test('contracts-check: type-only internal imports are reported with lower severity under the semantic engine', () => {
  const { report } = runTool('contracts-check.mjs', [tsPaths, ...semantic, '--modules-dir', 'src/core', '--fail-on', 'none'])
  const internal = byId(report, 'internal-import')
  const runtime = internal.find((f) => f.file === 'src/features/checkout/total.ts')
  const typeOnly = internal.find((f) => f.file === 'src/features/reports/report.ts')
  assert.ok(runtime && runtime.severity === 'high')
  assert.ok(typeOnly && typeOnly.severity === 'medium' && typeOnly.message.includes('type-only'))
  assert.equal(report.analysis.engine, 'semantic')
})

test('every graph tool accepts --format and --engine and keeps its JSON contract fields', () => {
  for (const tool of ['domain-deps.mjs', 'contracts-check.mjs', 'state-audit.mjs', 'routes-audit.mjs', 'leak-patterns.mjs', 'component-complexity.mjs']) {
    const r = runTool(tool, [next, '--engine', 'lexical', '--format', 'json', '--fail-on', 'none'], { parse: false })
    assert.equal(r.code, 0, `${tool}: ${r.stderr}`)
    const report = JSON.parse(r.stdout)
    for (const key of ['tool', 'version', 'root', 'framework', 'summary', 'findings', 'notes', 'data', 'analysis']) assert.ok(key in report, `${tool} lacks ${key}`)
    assert.equal(report.version, '1.4.0')
    assert.equal(report.analysis.engine, 'lexical')
    assert.equal(report.analysis.requested, 'lexical')
  }
  const md = runTool('domain-deps.mjs', [next, '--format', 'markdown', '--fail-on', 'none'], { parse: false })
  assert.match(md.stdout, /^# domain-deps/)
})
