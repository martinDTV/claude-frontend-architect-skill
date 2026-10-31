// design-contract (1.5 increment 5): the written outcome of the visual-direction method validated for what a file can
// prove (traceability, grids, roles, WCAG pairs in both themes, state floors) and emitted as tokens. The three
// contracts the reference applications consume must validate clean; the negative cases are built from the first one.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, here, runTool, scriptsDir } from './helpers.mjs'

const contractsDir = join(here, '..', 'design', 'contracts')
const atlas = JSON.parse(readFileSync(join(contractsDir, 'atlas-logistics.json'), 'utf8'))
const { emit, typeSizes, validateContract, DEFAULT_PAIRS, ROLES } = await import(join(scriptsDir, 'design-contract.mjs'))
const { contrast, parseColor, ramp, toOklab } = await import(join(scriptsDir, 'lib', 'color.mjs'))

const variant = (mutate) => {
  const copy = JSON.parse(JSON.stringify(atlas))
  mutate(copy)
  const file = join(mkdtempSync(join(tmpdir(), 'fa-contract-')), 'contract.json')
  writeFileSync(file, JSON.stringify(copy))
  return file
}

test('the three reference contracts validate with no confirmed finding; every decision cites a requirement; every pair passes in both themes', () => {
  for (const name of ['atlas-logistics', 'lumen-notebook', 'ember-store']) {
    const { code, report } = runTool('design-contract.mjs', [join(contractsDir, `${name}.json`), '--fail-on', 'none'])
    assert.equal(code, 0, name)
    assert.equal(report.summary.confirmed, 0, `${name}: ${JSON.stringify(report.findings.filter((f) => f.level === 'confirmed').map((f) => f.message))}`)
    assert.equal(report.summary.decisionsCitingRequirements, report.summary.decisions, `${name}: traceability`)
    assert.equal(report.summary.areasCovered, report.summary.areasTotal, `${name}: every area decided`)
    assert.equal(report.summary.pairsBelow, 0, name)
    assert.deepEqual(report.summary.themes, ['light', 'dark'])
    assert.ok(report.summary.pairsChecked >= DEFAULT_PAIRS.length * 2, `${name}: pairs in both themes`)
    for (const theme of ['light', 'dark']) for (const role of ROLES) assert.ok(report.data.roles[theme][role], `${name}: ${theme}.${role} resolved`)
  }
})

test('a decision that cites nothing, or an unknown requirement, is a confirmed finding; an uncited requirement is a heuristic', () => {
  const file = variant((c) => { c.decisions[0].because = []; c.decisions[1].because = ['R99']; c.requirements.push({ id: 'R10', text: 'never cited' }) })
  const { code, report } = runTool('design-contract.mjs', [file])
  assert.equal(code, 1)
  const missing = byId(report, 'decision-without-requirement')
  assert.equal(missing.length, 2)
  assert.ok(missing.every((f) => f.level === 'confirmed'))
  const uncited = byId(report, 'requirement-without-decision')
  assert.equal(uncited.length, 1)
  assert.equal(uncited[0].level, 'heuristic')
  assert.match(uncited[0].message, /R10/)
})

test('missing sections, off-grid spacing, a thin focus ring, a small target and an undecided reduced-motion policy are confirmed', () => {
  const file = variant((c) => { delete c.direction; c.spacing.scale.push(10); c.states.focusRing.width = 1; c.states.minTarget = 20; delete c.motion.reducedMotion })
  const { report } = runTool('design-contract.mjs', [file])
  assert.equal(byId(report, 'contract-missing-section')[0].section, 'direction')
  assert.match(byId(report, 'spacing-off-grid')[0].message, /10px/)
  assert.equal(byId(report, 'focus-ring-too-thin')[0].level, 'confirmed')
  assert.equal(byId(report, 'target-size-below')[0].level, 'confirmed')
  assert.equal(byId(report, 'reduced-motion-undecided')[0].level, 'confirmed')
})

test('a semantic pair below its WCAG ratio is confirmed with the computed ratio; an unknown ramp step is confirmed; a violet accent is a heuristic', () => {
  const file = variant((c) => { c.color.roles.light['fg-muted'] = '{neutral.400}'; c.color.roles.dark.border = '{neutral.42}'; c.color.accent = '#7c3aed' })
  const { report } = runTool('design-contract.mjs', [file])
  const below = byId(report, 'contrast-pair-below').filter((f) => f.theme === 'light' && f.pair[0] === 'fg-muted')
  assert.ok(below.length >= 1, JSON.stringify(report.findings.map((f) => f.id)))
  assert.ok(below[0].ratio < 4.5 && below[0].required === 4.5 && below[0].level === 'confirmed')
  assert.match(byId(report, 'semantic-reference-unresolved')[0].message, /neutral\.42/)
  assert.equal(byId(report, 'generic-accent-hue')[0].level, 'heuristic')
})

test('a contract without dark mode is checked in light only; a direction statement over three lines is confirmed', () => {
  const file = variant((c) => { c.darkMode = false; c.direction.statement = 'one\ntwo\nthree\nfour' })
  const { report } = runTool('design-contract.mjs', [file])
  assert.deepEqual(report.summary.themes, ['light'])
  assert.equal(byId(report, 'direction-statement-too-long')[0].level, 'confirmed')
  assert.equal(byId(report, 'semantic-role-missing').length, 0)
})

test('ramps: eleven in-gamut steps, lightness strictly decreasing, hue kept; a tinted neutral stays near grey', () => {
  const accent = ramp('#1f4e8c')
  const steps = Object.keys(accent).map(Number)
  assert.deepEqual(steps, [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950])
  const L = steps.map((s) => toOklab(parseColor(accent[s])).L)
  assert.ok(L.every((v, i) => i === 0 || v < L[i - 1]), 'monotonic lightness')
  for (const hex of Object.values(accent)) assert.match(hex, /^#[0-9a-f]{6}$/)
  const neutral = ramp('#1f4e8c', { chromaScale: 0.08 })
  const { r, g, b } = parseColor(neutral[500])
  assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 24, `neutral 500 is near grey: ${neutral[500]}`)
  assert.ok(contrast(parseColor(accent[700]), parseColor('#ffffff')) >= 4.5, '700 reads as text on white')
  assert.ok(contrast(parseColor(accent[300]), parseColor(neutral[950])) >= 4.5, '300 reads as text on the darkest neutral')
})

test('fluid type: sizes below the fluid step are fixed, above it a clamp between the tight and the full scale', () => {
  const sizes = typeSizes({ ratio: 1.25, baseRem: 1, steps: { sm: -1, base: 0, xl: 2, display: 6 }, fluid: { minViewport: 320, maxViewport: 1280, fromStep: 2, minRatio: 1.15 } })
  assert.equal(sizes.base.css, '1.0000rem')
  assert.equal(sizes.sm.css, '0.8000rem')
  assert.match(sizes.xl.css, /^clamp\(1\.3225rem, .* \+ .*vw, 1\.5625rem\)$/)
  assert.ok(sizes.display.min < sizes.display.max && sizes.display.max > 3.8)
})

test('emitters: CSS variables for ramps and roles per theme; Tailwind theme with utilities for the roles; Nuxt UI mapping; DTCG with aliases', () => {
  const css = emit(atlas, 'css')
  assert.match(css, /:root \{[\s\S]*--color-accent-700: #345d94;[\s\S]*--color-fg: #/)
  assert.match(css, /\.dark, \[data-theme="dark"\] \{[\s\S]*--color-canvas: #/)
  assert.match(css, /--duration-fast: 120ms;/)
  assert.match(css, /--ease-standard: cubic-bezier\(0\.2, 0, 0, 1\);/)
  assert.match(css, /--focus-ring-width: 2px;/)
  const tw = emit(atlas, 'tailwind')
  assert.match(tw, /@theme \{[\s\S]*--color-neutral-950: #/)
  assert.match(tw, /@theme inline \{[\s\S]*--color-fg: var\(--fg\);[\s\S]*--color-border-strong: var\(--border-strong\);/)
  assert.match(tw, /@custom-variant dark/)
  assert.match(tw, /--breakpoint-md: 48rem;/)
  const nuxt = emit(atlas, 'nuxt-ui')
  assert.match(nuxt, /--ui-primary: var\(--accent\);/)
  assert.match(nuxt, /primary: 'accent'/)
  const dtcg = JSON.parse(emit(atlas, 'dtcg'))
  assert.equal(dtcg.color.accent[700].$type, 'color')
  assert.equal(dtcg.color.accent[700].$value.hex, '#345d94')
  assert.equal(dtcg.color.role.dark.accent.$value, '{color.accent.300}')
  assert.deepEqual(dtcg.space['16'], { $type: 'dimension', $value: { value: 1, unit: 'rem' } })
  assert.equal(dtcg.motion['duration-fast'].$value.unit, 'ms')
  assert.equal(dtcg.shadow.popover.$type, 'shadow')
  // the validation report of the same file (library call) agrees with the CLI
  assert.equal(validateContract(atlas, 'atlas.json').summary.confirmed, 0)
})

test('--emit prints tokens only (no report) and an unknown format exits 2', () => {
  const { code, stdout } = runTool('design-contract.mjs', [join(contractsDir, 'atlas-logistics.json'), '--emit', 'css'], { parse: false })
  assert.equal(code, 0)
  assert.match(stdout, /^\/\* design contract "atlas-logistics"/)
  assert.doesNotMatch(stdout, /findings/)
  const bad = runTool('design-contract.mjs', [join(contractsDir, 'atlas-logistics.json'), '--emit', 'sass'], { parse: false })
  assert.equal(bad.code, 2)
})
