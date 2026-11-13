// design-system-starter (1.8 increment 5): the Nuxt layer shipped under the skill's assets keeps the four properties it
// teaches. Static checks here (the gate also extends it from the Nuxt reference app, type-checks it, renders it on
// /design-system and runs browser-audit over it — see verification/browser/design-checks.mjs). Generated files are
// checked byte for byte against a fresh emission, so the starter can never ship a stale token sheet or AGENTS section.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const skill = join(root, 'plugins', 'frontend-architect', 'skills', 'frontend-architect')
const scripts = join(skill, 'scripts')
const starter = join(skill, 'assets', 'design-system-starter')
const run = (script, args) => { try { return execFileSync('node', [join(scripts, script), ...args], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }) } catch (e) { return e.stdout || '' } }
const json = (script, args) => JSON.parse(run(script, [...args, '--json']))

test('the inventory of the starter is clean: nine public, documented components, one data view with the five states, no finding', () => {
  const r = json('design-system-inventory.mjs', [starter])
  assert.equal(r.summary.components, 9); assert.equal(r.summary.public, 9); assert.equal(r.summary.undocumentedPublic, 0)
  assert.equal(r.summary.passThroughWrappers, 0); assert.equal(r.summary.dataViews, 1); assert.equal(r.summary.dataViewsMissingStates, 0)
  assert.deepEqual(r.findings, [])
  const region = r.data.components.find((c) => c.name === 'DsDataRegion')
  assert.deepEqual(region.dataView, { states: ['loading', 'empty', 'error', 'partial', 'success'], missing: [] })
  const wrappers = r.data.components.filter((c) => c.owner === 'library-wrapper').map((c) => c.name).sort()
  assert.deepEqual(wrappers, ['DsButton', 'DsDialog', 'DsIconButton'], 'the three wrappers each add a rule (props/emits/models), so none is a pass-through')
  assert.ok(r.data.components.every((c) => c.tokens.literals === 0), 'no colour literal in any component')
  assert.equal(r.data.barrel, 'app/components/ui/index.ts')
})

test('the generated files are byte-identical to a fresh emission (tokens, Nuxt UI map, AGENTS section)', () => {
  const contract = join(starter, 'design-contract.json')
  assert.equal(run('design-contract.mjs', [contract, '--emit', 'tailwind', '--nuxt-ui-neutral', 'contract-neutral']), readFileSync(join(starter, 'app/assets/css/tokens.css'), 'utf8'), 'tokens.css is regenerated, never edited')
  assert.equal(run('design-contract.mjs', [contract, '--emit', 'nuxt-ui']), readFileSync(join(starter, 'app/assets/css/nuxt-ui-map.css'), 'utf8'), 'nuxt-ui-map.css is regenerated, never edited')
  assert.equal(run('design-system-inventory.mjs', [starter, '--agents']), readFileSync(join(starter, 'AGENTS.md'), 'utf8'), 'AGENTS.md is the inventory output, never hand-edited')
})

test('the contract validates and the other static audits agree: no literal defect, no static a11y defect', () => {
  const c = json('design-contract.mjs', [join(starter, 'design-contract.json')])
  assert.ok(!c.findings.some((f) => f.level === 'confirmed'), 'contract has no confirmed finding')
  const dc = json('design-consistency.mjs', [starter, '--contract', join(starter, 'design-contract.json'), '--exclude', 'app/assets/**'])
  assert.deepEqual(dc.findings.filter((f) => f.level === 'confirmed'), [], 'design-consistency: no defect')
  const ua = json('ui-audit.mjs', [starter])
  assert.deepEqual(ua.findings.filter((f) => f.level !== 'info'), [], 'ui-audit: nothing static or review-level')
})

test('the layer is what the doctrine says: barrel, no-prefix registration, absolute stylesheet paths, no alias inside the layer', () => {
  const cfg = readFileSync(join(starter, 'nuxt.config.ts'), 'utf8')
  assert.match(cfg, /pathPrefix: false/, 'components register without the directory prefix')
  assert.match(cfg, /new URL\(p, import\.meta\.url\)/, 'stylesheets resolved from the layer, not the consuming app')
  for (const f of ['DsButton', 'DsIconButton', 'DsField', 'DsSelect', 'DsDialog', 'DsDataRegion', 'DsEmptyState', 'DsStatusBadge', 'DsKpi']) {
    const src = readFileSync(join(starter, 'app/components/ui', `${f}.vue`), 'utf8')
    assert.doesNotMatch(src, /from ['"][~@]\//, `${f}: no ~/ or @/ alias inside a layer component`)
    assert.match(src, /^<!--[\s\S]*?@example/, `${f}: documented with an @example`)
  }
  assert.ok(existsSync(join(starter, 'README.md')) && existsSync(join(starter, 'design-contract.json')))
})
