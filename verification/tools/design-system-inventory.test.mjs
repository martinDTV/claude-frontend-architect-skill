// design-system-inventory (1.8 increment 2): the script against the fixture's hand-written truth (every fact of every
// component, every must / mustNot finding with its level, the summary and exit code), the tool invariants (read-only:
// the project is byte-identical after a run; exit 2 without a root; a frozen set of contract keys), and the --agents
// section (public components only, undocumented named, partial props said to be partial, the four rules).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const script = join(root, 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts', 'design-system-inventory.mjs')
const fixture = join(here, 'fixtures', 'ds-inventory-nuxt')
const truth = JSON.parse(readFileSync(join(fixture, 'truth.json'), 'utf8'))

function run(args, cwd = root) {
  try { return { code: 0, out: execFileSync('node', [script, ...args], { cwd, encoding: 'utf8' }) } }
  catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ''}`, err: `${e.stderr || ''}` } }
}
function treeHash(dir) {
  const h = createHash('sha256')
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else h.update(n).update(readFileSync(p)) } }
  walk(dir); return h.digest('hex')
}
const sorted = (a) => [...a].sort()

test('every fact of every component matches the truth (owner, public, documented, API, variants, tokens, data view, ejection)', () => {
  const before = treeHash(fixture)
  const r = run([fixture, '--json'])
  assert.equal(treeHash(fixture), before, 'read-only: the fixture is byte-identical after the run')
  assert.equal(r.code, truth.summaryExpectations.exitCode, 'exit code = confirmed findings present')
  const report = JSON.parse(r.out)
  const byFile = Object.fromEntries(report.data.components.map((c) => [c.file, c]))
  for (const [file, e] of Object.entries(truth.components)) {
    const c = byFile[file]
    assert.ok(c, `${file} inventoried`)
    assert.equal(c.name, e.name); assert.equal(c.owner, e.owner, `${file} owner`); assert.equal(c.public, e.public, `${file} public`); assert.equal(c.documented, e.documented, `${file} documented`)
    assert.equal(c.layer ?? null, e.layer ?? null, `${file} layer`)
    if (e.wraps) assert.equal(c.wraps, e.wraps)
    assert.equal(c.props.resolution, e.props.resolution, `${file} props.resolution`)
    assert.deepEqual(sorted(c.props.names), sorted(e.props.names), `${file} props`)
    if (e.props.defaults) assert.deepEqual(c.props.defaults, e.props.defaults, `${file} defaults`)
    if (e.props.spreadFrom) assert.deepEqual(c.props.spreadFrom, e.props.spreadFrom)
    assert.deepEqual(sorted(c.emits), sorted(e.emits), `${file} emits`); assert.deepEqual(sorted(c.slots), sorted(e.slots), `${file} slots`); assert.deepEqual(c.models, e.models, `${file} models`)
    assert.deepEqual(c.variants ? { source: c.variants.source, axes: c.variants.axes } : null, e.variants, `${file} variants`)
    assert.deepEqual(sorted(c.tokens.used), sorted(e.tokens.used), `${file} tokens.used`); assert.equal(c.tokens.literals, e.tokens.literals, `${file} literals`)
    assert.deepEqual(c.dataView, e.dataView, `${file} dataView`); assert.deepEqual(c.ejected, e.ejected, `${file} ejected`)
  }
  assert.equal(report.data.components.length, Object.keys(truth.components).length, 'nothing beyond the truth')
  assert.deepEqual(sorted(report.data.tokens.declared), sorted(truth.tokens.declared)); assert.deepEqual(sorted(report.data.tokens.unused), sorted(truth.tokens.unused))
  assert.deepEqual(report.data.library.name, truth.library.name); assert.deepEqual(report.data.roots, truth.roots)
})

test('every must finding is reported at its level and no mustNot finding appears (FP traps hold)', () => {
  const report = JSON.parse(run([fixture, '--json']).out)
  for (const [file, t] of Object.entries(truth.findings)) {
    const got = report.findings.filter((f) => f.file === file)
    for (const id of t.must) { const f = got.find((x) => x.id === id); assert.ok(f, `${file}: ${id} reported`); assert.equal(f.level, t.levels[id], `${file}: ${id} level`) }
    for (const id of t.mustNot) assert.ok(!got.some((x) => x.id === id), `${file}: ${id} must NOT be reported`)
  }
  const e = truth.summaryExpectations
  for (const k of ['components', 'public', 'undocumentedPublic', 'passThroughWrappers', 'ejected', 'drifted', 'dataViews', 'dataViewsMissingStates']) assert.equal(report.summary[k], e[k], `summary.${k}`)
  for (const f of report.findings) assert.ok(['confirmed', 'heuristic', 'info'].includes(f.level) && f.file && f.message && f.fix, 'every finding has level, file, message, fix')
})

test('the JSON contract carries the frozen keys and the analysis line names the lexical engine honestly', () => {
  const report = JSON.parse(run([fixture, '--json']).out)
  assert.deepEqual(sorted(Object.keys(report)).filter((k) => !['excluded'].includes(k)), sorted(['tool', 'version', 'root', 'framework', 'generatedAt', 'config', 'summary', 'findings', 'notes', 'data', 'analysis']))
  assert.equal(report.tool, 'design-system-inventory'); assert.equal(report.analysis.engine, 'lexical'); assert.match(report.analysis.reason, /lexically by design/)
  assert.deepEqual(sorted(Object.keys(report.data)), sorted(['library', 'roots', 'barrel', 'components', 'tokens']))
  const c = report.data.components[0]
  assert.deepEqual(sorted(Object.keys(c)), sorted(['file', 'name', 'layer', 'owner', 'wraps', 'public', 'documented', 'props', 'emits', 'slots', 'models', 'variants', 'tokens', 'dataView', 'ejected']))
  assert.ok(!('passThrough' in c), 'the internal pass-through flag is not part of the contract')
})

test('--agents prints only the dense section: public components, "undocumented" named, partial props said to be partial, the rules', () => {
  const r = run([fixture, '--agents'])
  assert.equal(r.code, 0)
  assert.match(r.out, /^## Design system \(generated by design-system-inventory — do not edit\)/)
  assert.match(r.out, /Import public components from `app\/components\/ui\/index.ts`/)
  assert.match(r.out, /\| UiSelect \| undocumented \|/)
  assert.match(r.out, /UiIconButton[^\n]*\(\+ more, not statically resolved\)/)
  assert.match(r.out, /UiDialog \(wraps UModal\)/); assert.match(r.out, /UiBadge \(ejected\)/)
  assert.doesNotMatch(r.out, /UiPill|UiBrandMark/, 'private components are not in the agents table')
  assert.match(r.out, /variant: solid\\\|ghost\\\|danger; size: xs\\\|sm\\\|md/, 'variant axes rendered (pipes escaped inside the table)')
  assert.match(r.out, /Rules: import from the barrel[^\n]*five states|loading, empty, error, partial and success/)
  assert.doesNotMatch(r.out, /^# design-system-inventory/m, 'no report header: the section is meant to be pasted as is')
})

test('exit 2 and a clear message when no design-system root exists; --roots points the tool elsewhere', () => {
  const none = run([join(here, 'fixtures', 'ts-paths'), '--json'])
  assert.equal(none.code, 2); assert.match(none.err, /no design-system root found \(looked in components\/ui/)
  const pointed = run([join(here, 'fixtures', 'ts-paths'), '--roots', 'src', '--json'])
  assert.notEqual(pointed.code, 2, '--roots overrides the defaults')
})

test('without a barrel every component is public; a private one then counts as undocumented', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'fa-dsinv-'))
  try {
    cpSync(fixture, tmp, { recursive: true })
    rmSync(join(tmp, 'app/components/ui/index.ts'))
    const report = JSON.parse(run([tmp, '--json']).out)
    assert.equal(report.data.barrel, null)
    assert.ok(report.data.components.every((c) => c.public))
    assert.ok(report.findings.some((f) => f.id === 'undocumented-public-component' && /UiPill/.test(f.file)), 'UiPill becomes public and undocumented')
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test('refreshing the ejection hash clears the drift finding; editing an intact copy raises it', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'fa-dsinv-'))
  try {
    cpSync(fixture, tmp, { recursive: true })
    const avatar = join(tmp, 'app/components/ui/UiAvatar.vue'); const src = readFileSync(avatar, 'utf8')
    const m = /^(<!-- @ds-ejected from="[^"]+" version="[^"]+" sha256=")([0-9a-f]{64})(" -->\n)/.exec(src)
    const body = src.slice(m[0].length)
    writeFileSync(avatar, `${m[1]}${createHash('sha256').update(body).digest('hex')}${m[3]}${body}`)
    const badge = join(tmp, 'app/components/ui/UiBadge.vue'); writeFileSync(badge, readFileSync(badge, 'utf8').replace('px-2 py-0.5', 'px-3 py-1'))
    const report = JSON.parse(run([tmp, '--json']).out)
    const drifted = report.findings.filter((f) => f.id === 'ejected-copy-drifted').map((f) => f.file)
    assert.deepEqual(drifted, ['app/components/ui/UiBadge.vue'])
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})
