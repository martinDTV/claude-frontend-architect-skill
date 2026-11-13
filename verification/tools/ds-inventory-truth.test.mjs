// design-system-inventory — design freeze (1.8 increment 1). There is NO script yet. These tests pin the ground truth
// against the fixture so the truth cannot silently diverge before the implementation starts: every truth entry names a
// real file, every component under the roots is in the truth, the public set equals the barrel, the ejection markers
// say what the truth says (one intact, one drifted — verified by recomputing the hash here, independently of any
// future tool code), and the summary expectations add up from the per-component facts.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = join(here, 'fixtures', 'ds-inventory-nuxt')
const truth = JSON.parse(readFileSync(join(fixture, 'truth.json'), 'utf8'))
const files = Object.keys(truth.components)

test('every truth component is a real file and every .vue under the roots is in the truth', () => {
  for (const f of files) assert.ok(existsSync(join(fixture, f)), `${f} exists`)
  const onDisk = truth.roots.flatMap((r) => readdirSync(join(fixture, r)).filter((n) => n.endsWith('.vue')).map((n) => `${r}/${n}`))
  assert.deepEqual(onDisk.sort(), files.slice().sort())
})

test('public = exported from the barrel; private and layer components are not public', () => {
  const barrel = readFileSync(join(fixture, 'app/components/ui/index.ts'), 'utf8')
  for (const [f, c] of Object.entries(truth.components)) {
    const exported = new RegExp(`from '\\./${c.name}\\.vue'`).test(barrel)
    assert.equal(c.public, exported, `${f}: public matches the barrel`)
  }
  assert.equal(truth.components['layers/brand/components/ui/UiBrandMark.vue'].layer, 'brand')
})

test('the ejection markers agree with the truth: Badge intact, Avatar drifted (hash recomputed here)', () => {
  for (const [f, c] of Object.entries(truth.components)) {
    const src = readFileSync(join(fixture, f), 'utf8')
    const m = /^<!-- @ds-ejected from="([^"]+)" version="([^"]+)" sha256="([0-9a-f]{64})" -->\n/.exec(src)
    if (!c.ejected) { assert.equal(m, null, `${f}: no marker`); continue }
    assert.ok(m, `${f}: has a marker`)
    assert.equal(m[1], c.ejected.from); assert.equal(m[2], c.ejected.version)
    const body = src.slice(m[0].length)
    const drifted = createHash('sha256').update(body).digest('hex') !== m[3]
    assert.equal(drifted, c.ejected.drifted, `${f}: drift state`)
  }
})

test('facts are internally consistent with the sources (spot checks written by hand)', () => {
  const c = truth.components
  assert.deepEqual(c['app/components/ui/UiDataTable.vue'].dataView.missing, [])
  assert.deepEqual(c['app/components/ui/UiList.vue'].dataView.missing, ['empty', 'error'])
  const sel = readFileSync(join(fixture, 'app/components/ui/UiSelect.vue'), 'utf8')
  assert.doesNotMatch(sel, /^<!--/, 'UiSelect has no leading doc comment (undocumented)')
  const card = readFileSync(join(fixture, 'app/components/ui/UiCard.vue'), 'utf8')
  assert.doesNotMatch(card, /defineProps|defineEmits|defineModel/, 'UiCard declares no API (pass-through)')
  const dialog = readFileSync(join(fixture, 'app/components/ui/UiDialog.vue'), 'utf8')
  assert.match(dialog, /defineProps<\{ title: string/, 'UiDialog adds props (not a pass-through)')
  const iconBtn = readFileSync(join(fixture, 'app/components/ui/UiIconButton.vue'), 'utf8')
  assert.match(iconBtn, /\.\.\.buttonProps/, 'UiIconButton spreads imported props')
  const tokens = readFileSync(join(fixture, 'app/assets/css/tokens.css'), 'utf8')
  for (const t of truth.tokens.declared) assert.match(tokens, new RegExp(`${t}:`), `${t} declared`)
  const all = files.map((f) => readFileSync(join(fixture, f), 'utf8')).join('\n')
  for (const t of truth.tokens.unused) assert.doesNotMatch(all, new RegExp(`var\\(${t}\\)`), `${t} used by no component`)
  for (const [f, cc] of Object.entries(c)) for (const t of cc.tokens.used) assert.match(readFileSync(join(fixture, f), 'utf8'), new RegExp(`var\\(${t}\\)`), `${f} uses ${t}`)
})

test('summary expectations add up from the per-component facts', () => {
  const cs = Object.values(truth.components); const e = truth.summaryExpectations
  assert.equal(cs.length, e.components)
  assert.equal(cs.filter((c) => c.public).length, e.public)
  assert.equal(cs.filter((c) => c.public && !c.documented).length, e.undocumentedPublic)
  assert.equal(cs.filter((c) => c.ejected).length, e.ejected)
  assert.equal(cs.filter((c) => c.ejected?.drifted).length, e.drifted)
  assert.equal(cs.filter((c) => c.dataView).length, e.dataViews)
  assert.equal(cs.filter((c) => c.dataView?.missing.length).length, e.dataViewsMissingStates)
  // the findings table names only v1 ids, and every "must" has a level
  const ids = new Set(['undocumented-public-component', 'pass-through-wrapper', 'data-view-missing-states', 'ejected-copy-drifted', 'props-partially-resolved'])
  for (const [f, t] of Object.entries(truth.findings)) {
    for (const id of [...t.must, ...t.mustNot]) assert.ok(ids.has(id), `${f}: ${id} is a v1 id`)
    for (const id of t.must) assert.ok(t.levels?.[id], `${f}: ${id} has a level`)
    assert.ok(truth.components[f], `${f}: findings refer to a truth component`)
  }
  assert.equal(Object.values(truth.findings).filter((t) => t.levels && Object.values(t.levels).includes('confirmed')).length > 0 ? 1 : 0, e.exitCode)
})
