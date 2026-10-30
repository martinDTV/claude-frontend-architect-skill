// Regression tests for the four defects found after the 1.2.0 publication (D1 symlinked execution,
// D2 stale builds in bundle-budget, D3 configurable exclusions, D4 Vue built-ins reported as unknown).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { byId, fixtures, runTool, scriptsDir } from './helpers.mjs'

const tsPaths = join(fixtures, 'ts-paths')
const vueTemplates = join(fixtures, 'vue-templates')
const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]
const TOOLS = ['domain-deps.mjs', 'contracts-check.mjs', 'state-audit.mjs', 'routes-audit.mjs', 'leak-patterns.mjs', 'component-complexity.mjs', 'bundle-budget.mjs']

function fakeNuxtBuild({ stale = false, manifest = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fa-build-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'built', dependencies: { nuxt: '^4.6.0' } }))
  const pub = join(root, '.output', 'public', '_nuxt')
  mkdirSync(join(pub, 'builds', 'meta'), { recursive: true })
  mkdirSync(join(root, '.output', 'server', 'chunks', 'build'), { recursive: true })
  const big = (n, seed) => Array.from({ length: n }, (_, i) => `function f${seed}${i}(){return ${i}*${seed}}`).join('\n')
  const files = { 'A1.js': big(3000, 7), 'B1.js': big(2000, 3), 'C1.js': big(9000, 5), 'entry.X.css': 'body{margin:0}'.repeat(500) }
  if (stale) Object.assign(files, { 'A0.js': big(3000, 8), 'B0.js': big(2000, 4), 'C0.js': big(9000, 6), 'entry.Y.css': 'body{margin:1px}'.repeat(500) })
  for (const [name, content] of Object.entries(files)) writeFileSync(join(pub, name), content)
  if (manifest) {
    const text = '{"node_modules/nuxt/dist/app/entry.js":{resourceType:"script",module:!0,isEntry:!0,file:"A1.js",imports:["_B1.js"],dynamicImports:["pages/big.vue"],css:["entry.X.css"]},"_B1.js":{resourceType:"script",module:!0,file:"B1.js"},"pages/big.vue":{resourceType:"script",module:!0,isDynamicEntry:!0,file:"C1.js",imports:["_B1.js"]}}'
    writeFileSync(join(root, '.output', 'server', 'chunks', 'build', 'client.manifest.mjs'), `const client_manifest = ${text};\n\nexport { client_manifest as default };\n`)
    writeFileSync(join(pub, 'builds', 'latest.json'), JSON.stringify({ id: 'new-id', timestamp: 2 }))
    writeFileSync(join(pub, 'builds', 'meta', 'new-id.json'), JSON.stringify({ id: 'new-id', timestamp: 2 }))
    if (stale) writeFileSync(join(pub, 'builds', 'meta', 'old-id.json'), JSON.stringify({ id: 'old-id', timestamp: 1 }))
  }
  const gz = (name) => gzipSync(files[name]).length
  return { root, gz }
}

const kb = (n) => Math.round((n / 1024) * 10) / 10

// ---------------------------------------------------------------- D1: main guard through symbolic links
test('D1: every tool runs when reached through a symbolic link, from another cwd, in a path with spaces', () => {
  const linkDir = mkdtempSync(join(tmpdir(), 'fa link ')) // space in the path, and /tmp is itself a symlink on macOS
  symlinkSync(scriptsDir, join(linkDir, 'scripts'))
  const built = fakeNuxtBuild()
  for (const tool of TOOLS) {
    const args = tool === 'bundle-budget.mjs' ? [built.root] : [tsPaths, '--engine', 'lexical']
    const r = spawnSync(process.execPath, [join(linkDir, 'scripts', tool), ...args, '--json', '--fail-on', 'none'], { encoding: 'utf8', cwd: tmpdir() })
    assert.equal(r.status, 0, `${tool}: ${r.stderr}`)
    assert.ok(r.stdout.trim().length > 0, `${tool} printed nothing through the symlink (main guard did not fire)`)
    const report = JSON.parse(r.stdout)
    assert.equal(report.tool, tool.replace('.mjs', ''))
    const help = spawnSync(process.execPath, [join(linkDir, 'scripts', tool), '--help'], { encoding: 'utf8' })
    assert.match(help.stdout, /usage:/, `${tool} --help through the symlink`)
  }
  // relative invocation from inside the linked directory
  const rel = spawnSync(process.execPath, ['scripts/domain-deps.mjs', tsPaths, '--engine', 'lexical', '--json', '--fail-on', 'none'], { encoding: 'utf8', cwd: linkDir })
  assert.equal(rel.status, 0)
  assert.equal(JSON.parse(rel.stdout).tool, 'domain-deps')
})

test('D1: a tool that is imported (not executed) does not run its CLI', async () => {
  const mod = await import(join(scriptsDir, 'leak-patterns.mjs'))
  assert.equal(typeof mod.run, 'function', 'importing exposes run() without executing it')
})

// ---------------------------------------------------------------- D2: bundle-budget and stale builds
test('D2: assets not referenced by the current build manifest are reported as stale and excluded from totals', () => {
  const { root, gz } = fakeNuxtBuild({ stale: true })
  const { code, report } = runTool('bundle-budget.mjs', [root, '--fail-on', 'none'])
  assert.equal(code, 0)
  assert.equal(report.summary.assetScope, 'manifest')
  assert.equal(report.summary.buildId, 'new-id')
  assert.deepEqual(report.summary.otherBuilds, ['old-id'])
  assert.equal(report.summary.files, 8, 'all files are still counted in `files` (1.2 meaning kept)')
  assert.equal(report.summary.measuredFiles, 4)
  assert.equal(report.summary.staleFiles, 4)
  assert.equal(report.summary.totalJsGzipKb, kb(gz('A1.js') + gz('B1.js') + gz('C1.js')), 'total = current build only')
  assert.equal(report.summary.staleJsGzipKb, kb(gz('A0.js') + gz('B0.js') + gz('C0.js')))
  assert.equal(report.summary.entryJsGzipKb, kb(gz('A1.js') + gz('B1.js')))
  assert.deepEqual(report.data.assets.filter((a) => a.scope === 'stale').map((a) => a.file).sort(), ['A0.js', 'B0.js', 'C0.js', 'entry.Y.css'])
  assert.deepEqual(report.data.assets.filter((a) => a.entry).map((a) => a.file).sort(), ['A1.js', 'B1.js', 'entry.X.css'])
  const stale = byId(report, 'stale-build-artifacts')
  assert.equal(stale.length, 1)
  assert.equal(stale[0].level, 'info')
  assert.match(stale[0].message, /old-id/)
  // B1 is imported by the entry and by the lazy page: a shared chunk; nothing is counted twice
  assert.equal(report.summary.sharedChunks, 1)
  assert.equal(report.data.assets.find((a) => a.file === 'B1.js').sharedBy, 2)
  assert.equal(new Set(report.data.assets.map((a) => a.file)).size, report.data.assets.length)
})

test('D2: without a manifest every file is measured and the scope says so; a clean build has no stale assets', () => {
  const noManifest = fakeNuxtBuild({ stale: true, manifest: false })
  const r1 = runTool('bundle-budget.mjs', [noManifest.root, '--fail-on', 'none'])
  assert.equal(r1.report.summary.assetScope, 'directory')
  assert.equal(r1.report.summary.staleFiles, 0)
  assert.equal(r1.report.summary.measuredFiles, 8)
  assert.ok(r1.report.notes.some((n) => /no build manifest found/.test(n)))
  assert.equal(byId(r1.report, 'stale-build-artifacts').length, 0)
  const clean = fakeNuxtBuild()
  const r2 = runTool('bundle-budget.mjs', [clean.root, '--fail-on', 'none'])
  assert.equal(r2.report.summary.staleFiles, 0)
  assert.equal(r2.report.summary.totalJsGzipKb, kb(clean.gz('A1.js') + clean.gz('B1.js') + clean.gz('C1.js')))
})

test('D2: Next.js output with a previous BUILD_ID directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'fa-next-build-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'nextbuilt', dependencies: { next: '^16.0.0', react: '^19.0.0' } }))
  const st = join(root, '.next', 'static')
  mkdirSync(join(st, 'chunks', 'app'), { recursive: true })
  mkdirSync(join(st, 'css'), { recursive: true })
  mkdirSync(join(st, 'NEWID'), { recursive: true })
  mkdirSync(join(st, 'OLDID'), { recursive: true })
  writeFileSync(join(st, 'chunks', 'main-app-1.js'), 'x'.repeat(5000))
  writeFileSync(join(st, 'chunks', 'app', 'page-1.js'), 'y'.repeat(4000))
  writeFileSync(join(st, 'chunks', 'leftover-9.js'), 'z'.repeat(7000))
  writeFileSync(join(st, 'css', 'a.css'), 'a{}'.repeat(100))
  writeFileSync(join(st, 'NEWID', '_buildManifest.js'), 'self.__BUILD_MANIFEST={}')
  writeFileSync(join(st, 'OLDID', '_buildManifest.js'), 'self.__BUILD_MANIFEST={}')
  writeFileSync(join(root, '.next', 'BUILD_ID'), 'NEWID')
  writeFileSync(join(root, '.next', 'build-manifest.json'), JSON.stringify({ rootMainFiles: ['static/chunks/main-app-1.js'], pages: {} }))
  writeFileSync(join(root, '.next', 'app-build-manifest.json'), JSON.stringify({ pages: { '/page': ['static/chunks/app/page-1.js', 'static/css/a.css'] } }))
  const { report } = runTool('bundle-budget.mjs', [root, '--fail-on', 'none'])
  assert.equal(report.summary.assetScope, 'manifest')
  assert.equal(report.summary.buildId, 'NEWID')
  assert.deepEqual(report.summary.otherBuilds, ['OLDID'])
  assert.deepEqual(report.data.assets.filter((a) => a.scope === 'stale').map((a) => a.file).sort(), ['OLDID/_buildManifest.js', 'chunks/leftover-9.js'])
  assert.ok(report.data.assets.find((a) => a.file === 'chunks/main-app-1.js').entry)
})

// ---------------------------------------------------------------- D3: exclusions
function copyFixture(src) {
  const dir = mkdtempSync(join(tmpdir(), 'fa-excl-'))
  cpSync(src, dir, { recursive: true })
  return dir
}

test('D3: exclude patterns from the config remove files and the report says what was left out', () => {
  const dir = copyFixture(tsPaths)
  writeFileSync(join(dir, '.frontend-audit.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(tsPaths, '.frontend-audit.json'), 'utf8')), exclude: ['src/features/reports/**', 'nothing-here/**'] }))
  const base = runTool('domain-deps.mjs', [tsPaths, '--engine', 'lexical', '--fail-on', 'none'])
  const { report } = runTool('domain-deps.mjs', [dir, '--engine', 'lexical', '--fail-on', 'none'])
  assert.equal(report.summary.files, base.report.summary.files - 1)
  assert.deepEqual(report.excluded.patterns, ['src/features/reports/**', 'nothing-here/**'])
  assert.equal(report.excluded.files, 1)
  assert.deepEqual(report.excluded.sample, ['src/features/reports/report.ts'])
  assert.deepEqual(report.excluded.unmatchedPatterns, ['nothing-here/**'])
  assert.ok(report.notes.some((n) => /1 file\(s\) excluded by configuration/.test(n)))
  assert.ok(report.notes.some((n) => /matched no file: nothing-here/.test(n)))
  assert.equal(report.analysis.excluded.files, 1)
  assert.ok(!report.data.edges.some((e) => e.from === 'src/features/reports/report.ts' || e.to === 'src/features/reports/report.ts'))
})

test('D3: --exclude on the CLI accepts bare directories, is merged with the config and drops edges pointing at excluded files', () => {
  const { report } = runTool('domain-deps.mjs', [tsPaths, ...semantic, '--exclude', 'src/lib,src/components', '--fail-on', 'none'])
  assert.deepEqual(report.excluded.patterns, ['src/lib', 'src/components'])
  assert.equal(report.excluded.files, 3, 'polyfill.ts and two .vue components')
  assert.ok(report.excluded.importsToExcluded >= 1, 'total.ts imports the excluded polyfill')
  assert.ok(!report.data.edges.some((e) => e.to === 'src/lib/polyfill.ts'))
  // the exclusion hides the shared-imports-domain findings that lived in the components, and the note records the exclusion
  assert.equal(byId(report, 'shared-imports-domain').length, 0)
  assert.ok(report.notes.some((n) => /Excluded code is not audited/.test(n)))
})

test('D3: invalid exclude patterns stop the tool with exit 2 instead of being ignored', () => {
  for (const tool of ['domain-deps.mjs', 'leak-patterns.mjs', 'state-audit.mjs']) {
    const r = runTool(tool, [tsPaths, '--exclude', '/absolute/**'], { parse: false })
    assert.equal(r.code, 2, tool)
    assert.match(r.stderr, /invalid exclude pattern/)
  }
  const up = runTool('routes-audit.mjs', [tsPaths, '--exclude', '../sibling/**'], { parse: false })
  assert.equal(up.code, 2)
  assert.match(up.stderr, /contains "\.\."/)
  const all = runTool('component-complexity.mjs', [tsPaths, '--exclude', '**'], { parse: false })
  assert.equal(all.code, 2)
  assert.match(all.stderr, /would exclude everything/)
})

test('D3: without exclusions the report has no excluded block (1.2 output unchanged)', () => {
  const { report } = runTool('domain-deps.mjs', [tsPaths, '--engine', 'lexical', '--fail-on', 'none'])
  assert.equal(report.excluded, undefined)
})

// ---------------------------------------------------------------- D4: Vue component classification
test('D4: the vue-templates fixture matches its ground truth under the semantic engine', () => {
  const truth = JSON.parse(readFileSync(join(vueTemplates, 'expected-edges.json'), 'utf8'))
  const { report } = runTool('domain-deps.mjs', [vueTemplates, ...semantic, '--fail-on', 'none'])
  assert.equal(report.summary.engine, 'semantic')
  const key = (e) => `${e.from} -> ${e.to} [${e.kind}]`
  const found = new Set(report.data.edges.map(key))
  const want = new Set(truth.edges.map(key))
  assert.deepEqual([...want].filter((k) => !found.has(k)), [], 'false negatives')
  assert.deepEqual([...found].filter((k) => !want.has(k)), [], 'false positives')
  for (const f of truth.noEdgesFrom) assert.ok(!report.data.edges.some((e) => e.from === f), `${f} must produce no edge (comments and strings only)`)
  assert.deepEqual(report.data.unknown.map((u) => u.name), truth.unknownComponents.map((u) => u.name), 'built-ins, locals, literals of :is and HTML tags are never unknown')
  assert.deepEqual(report.data.dynamicComponents.map((d) => `${d.file}:${d.expression}`).sort(), truth.dynamicComponents.map((d) => `${d.file}:${d.expression}`).sort())
  const res = report.summary.componentsByResolution
  assert.equal(res.unknown, 1)
  assert.equal(res.dynamic, truth.dynamicComponents.length)
  assert.ok(res.builtin >= 6, `transition, keep-alive, component, Teleport, slot, Transition: ${JSON.stringify(res)}`)
  assert.ok(res.local >= 1)
  assert.ok(res.catalog >= 3)
  assert.ok(report.notes.some((n) => /non-literal expression cannot be resolved statically/.test(n)))
})

test('D4: per-file component uses carry their classification (positive and negative cases)', () => {
  const { report } = runTool('domain-deps.mjs', [vueTemplates, ...semantic, '--fail-on', 'none'])
  // the semantic engine resolved <component is="SalesBadge"> and the literal inside the ternary to the same file
  const dyn = report.data.edges.filter((e) => e.from === 'app/components/ui/Dynamic.vue' && e.to === 'app/components/sales/SalesBadge.vue')
  assert.ok(dyn.length >= 1)
  assert.equal(dyn[0].via, 'component')
  // a lowercase word inside :is ('span', 'card') never becomes a component name
  assert.ok(!report.data.unknown.some((u) => ['Span', 'Card', 'span', 'card'].includes(u.name)))
  // LocalWidget is imported: no unknown, no catalog edge, one import edge
  const local = report.data.edges.filter((e) => e.from === 'app/components/ui/Dynamic.vue' && e.to === 'app/components/ui/LocalWidget.vue')
  assert.equal(local.length, 1)
  assert.equal(local[0].via, 'import')
})

test('D4: the lexical engine on the same fixture documents its limits without crashing', () => {
  const { code, report } = runTool('domain-deps.mjs', [vueTemplates, '--engine', 'lexical', '--fail-on', 'none'])
  assert.equal(code, 0)
  assert.deepEqual(report.data.unknown.map((u) => u.name), ['TotallyMissing'], 'lowercase special elements are not even candidates lexically')
  // known gap, recorded on purpose: the HTML comment in Documented.vue creates a lexical edge the AST does not
  assert.ok(report.data.edges.some((e) => e.from === 'app/components/ui/Documented.vue'), 'lexical false positive from an HTML comment (documented limit)')
  assert.ok(!report.data.edges.some((e) => e.from === 'app/pages/about.vue'), 'lexical engine does not resolve <component is="…"> (documented limit)')
})
