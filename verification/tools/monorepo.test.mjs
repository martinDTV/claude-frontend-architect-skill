// Monorepos (1.3): pnpm/npm/yarn workspaces, package.json exports and subpaths, cross-package barrels,
// TypeScript project references, and the scope rule (siblings of an app are named, never followed).
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const mono = join(fixtures, 'monorepo')
const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]
const truth = JSON.parse(readFileSync(join(mono, 'expected-edges.json'), 'utf8'))
const key = (e) => `${e.from} -> ${e.to} [${e.kind}]`

test('workspace root: packages resolve through exports/main and the edge set matches the ground truth', () => {
  const { code, report } = runTool('domain-deps.mjs', [mono, ...semantic, '--fail-on', 'none'])
  assert.equal(code, 0)
  assert.equal(report.framework, 'workspace')
  assert.equal(report.summary.workspace.type, 'pnpm')
  assert.equal(report.summary.workspace.packages, 3)
  const found = new Set(report.data.edges.map(key))
  const want = new Set(truth.edges.map(key))
  assert.deepEqual([...want].filter((k) => !found.has(k)), [], 'false negatives')
  assert.deepEqual([...found].filter((k) => !want.has(k)), [], 'false positives')
  assert.ok(report.data.edges.filter((e) => e.package).every((e) => e.resolution === 'workspace' && e.confidence === 'verified'))
  // external vs workspace packages
  assert.deepEqual(report.data.packageImports.map((p) => `${p.name}:${p.scope}`), truth.packages.external.map((n) => `${n}:external`))
  assert.equal(report.data.unknownImports.length, 0, 'nothing is "unresolved" in a workspace with declared dependencies')
  // project references supply per-package compiler options
  assert.ok(report.analysis.tsconfig.references.some((r) => r.dir === 'apps/web' && r.paths === 2))
  assert.ok(report.analysis.tsconfig.references.some((r) => r.dir === 'packages/ui'))
})

test('workspace root: symbol origins cross packages, and a missing name is reported as not-found', () => {
  const { report } = runTool('domain-deps.mjs', [mono, ...semantic, '--fail-on', 'none'])
  const origins = []
  for (const e of report.data.edges) for (const o of e.origins ?? []) origins.push({ from: e.from, name: o.name, file: o.file, hops: o.hops, status: o.status, viaStar: o.viaStar })
  for (const s of truth.symbols) {
    const hit = origins.find((o) => o.from === s.from && o.name === s.name)
    assert.ok(hit, `${s.from} ${s.name}`)
    assert.equal(hit.status, s.status, `${s.name} status`)
    assert.equal(hit.file, s.file, `${s.name} file`)
    assert.equal(hit.hops, s.hops, `${s.name} hops`)
    if (s.viaStar) assert.equal(hit.viaStar, true)
  }
  assert.equal(report.summary.symbolResolution.notFound, 1)
  // --follow-reexports attributes formatMoney to the shared package even when imported from the ui barrel
  const followed = runTool('domain-deps.mjs', [mono, ...semantic, '--follow-reexports', '--fail-on', 'none'])
  assert.ok(followed.report.data.edges.some((e) => e.via === 'reexport' && e.from === 'apps/web/app/components/Price.vue' && e.to === 'packages/shared/src/money.ts' && e.hops === 2))
})

test('contracts-check on the packages: entries from package.json, cross-package barrel, deep import of an unexported subpath', () => {
  const { report } = runTool('contracts-check.mjs', [mono, ...semantic, '--modules-dir', truth.contracts.modulesDir, '--fail-on', 'none'])
  for (const [mod, entry] of Object.entries(truth.contracts.entries)) {
    const m = report.data.modules.find((x) => x.root === mod)
    assert.ok(m, mod)
    assert.equal(m.index, entry)
    assert.equal(m.entryKind, 'package.json')
  }
  assert.equal(byId(report, 'module-without-entry').length, 0)
  const crosses = byId(report, 'reexport-crosses-module')
  assert.deepEqual(crosses.map((f) => f.message.includes('formatMoney') && f.message.includes('packages/shared/src/money.ts')), [true])
  const subpath = byId(report, 'package-subpath-not-exported')
  assert.equal(subpath.length, 1)
  assert.equal(subpath[0].file, 'apps/web/app/pages/deep.vue')
  assert.equal(subpath[0].level, 'confirmed')
  assert.match(subpath[0].message, /@acme\/ui\/src\/internal\/theme/)
  // the deep import is also an internal import; the published subpath "./button" is not
  const internal = byId(report, 'internal-import')
  assert.ok(internal.some((f) => f.file === 'apps/web/app/pages/deep.vue' && f.message.includes('internal/theme.ts')))
  assert.ok(!internal.some((f) => f.message.includes('button.ts')), 'a published subpath export is not an internal import')
})

test('inside an app of the workspace: sibling packages are named as workspace imports, never followed, never unresolved', () => {
  const { report } = runTool('domain-deps.mjs', [join(mono, truth.fromAppDir.root), ...semantic, '--fail-on', 'none'])
  assert.equal(report.framework, 'nuxt')
  assert.equal(report.summary.workspace.type, 'pnpm')
  assert.equal(report.summary.workspace.siblingsImported, truth.fromAppDir.workspaceSiblings.length)
  const scopes = Object.fromEntries(report.data.packageImports.map((p) => [p.name, p.scope]))
  for (const n of truth.fromAppDir.workspaceSiblings) assert.equal(scopes[n], 'workspace', n)
  for (const n of truth.fromAppDir.external) assert.equal(scopes[n], 'external', n)
  assert.equal(report.data.unknownImports.length, 0)
  assert.equal(report.data.edges.filter((e) => e.to.startsWith('..')).length, truth.fromAppDir.edgesIntoSiblings)
  assert.ok(report.notes.some((n) => /sibling packages .* are listed as workspace imports, not followed/.test(n)))
})

test('npm/yarn "workspaces" in package.json are detected like pnpm-workspace.yaml', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fa-npmws-'))
  cpSync(mono, dir, { recursive: true })
  rmSync(join(dir, 'pnpm-workspace.yaml'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acme', private: true, workspaces: ['apps/*', 'packages/*'] }))
  const npm = runTool('domain-deps.mjs', [dir, ...semantic, '--fail-on', 'none'])
  assert.equal(npm.report.summary.workspace.type, 'npm')
  assert.equal(npm.report.summary.workspace.packages, 3)
  writeFileSync(join(dir, 'yarn.lock'), '# yarn lockfile v1\n')
  const yarn = runTool('domain-deps.mjs', [dir, ...semantic, '--fail-on', 'none'])
  assert.equal(yarn.report.summary.workspace.type, 'yarn')
  // the edge set is the same regardless of the workspace manager
  assert.deepEqual(new Set(yarn.report.data.edges.map(key)), new Set(truth.edges.map(key)))
})

test('the other tools run at a workspace root without framework-specific assumptions', () => {
  for (const tool of ['state-audit.mjs', 'routes-audit.mjs', 'leak-patterns.mjs', 'component-complexity.mjs']) {
    const { code, report } = runTool(tool, [mono, ...semantic, '--fail-on', 'none'])
    assert.equal(code, 0, `${tool}`)
    assert.equal(report.framework, 'workspace')
  }
})
