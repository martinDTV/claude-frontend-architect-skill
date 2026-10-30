// 1.4.1: the grade browser-audit gives an axe rule is checked against the metadata of the pinned axe-core, in Node,
// without a browser. Keeps the documented lists (expected-browser.json, migrations.json) honest when axe is bumped.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const axe = require('axe-core')
const tool = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts', 'browser-audit.mjs')
const { classifyAxeRule } = await import(tool)
const truth = JSON.parse(readFileSync(join(here, 'fixture', 'expected-browser.json'), 'utf8')).axeClassification
const migrations = JSON.parse(readFileSync(join(here, '..', 'tools', 'baselines', 'migrations.json'), 'utf8'))

const rules = axe._audit.rules
const isWcag = (r) => r.tags.some((t) => /^wcag\d/.test(t))
const high = (r) => r.impact === 'serious' || r.impact === 'critical'
const grade = (r) => classifyAxeRule({ id: r.id, impact: r.impact, tags: r.tags })

test('the pinned axe-core is the version the truth was written for', () => {
  assert.equal(axe.version, truth.axe)
  assert.ok(rules.length > 90, `axe exposes its rules (${rules.length})`)
})

test('best-practice-only rules grade heuristic/low whatever their impact; the high-impact ones are exactly the documented seven', () => {
  const bestPractice = rules.filter((r) => r.tags.includes('best-practice') && !isWcag(r))
  assert.ok(bestPractice.length >= 25)
  for (const r of bestPractice) {
    const g = grade(r)
    assert.equal(g.level, 'heuristic', r.id)
    assert.equal(g.severity, 'low', r.id)
    assert.equal(g.basis, r.tags.includes('experimental') ? 'experimental' : 'best-practice', r.id)
    assert.deepEqual(g.criteria, [], r.id)
  }
  const enabledHigh = bestPractice.filter((r) => r.enabled !== false && high(r)).map((r) => r.id).sort()
  assert.deepEqual(enabledHigh, truth.bestPracticeHighImpact)
  // the migration entry that documents the re-grade matches a 1.4.0 fingerprint of each of them and nothing WCAG-tagged
  const entry = migrations['1.4.0'].find((m) => /best-practice only/.test(m.reason))
  assert.ok(entry, 'migrations.json documents the 1.4.1 re-grade of best-practice rules')
  const re = new RegExp(entry.match)
  for (const id of enabledHigh) assert.match(`axe-${id}|/|` + `|confirmed|${id === 'frame-tested' ? 'critical' : 'high'}`, re)
  for (const id of ['color-contrast', 'image-alt', 'label', 'button-name']) assert.doesNotMatch(`axe-${id}|/||confirmed|high`, re)
})

test('WCAG-tagged rules of impact critical/serious grade confirmed, except the rules with a documented scope limit', () => {
  // experimental rules never reach a report: axe.run skips the `experimental` tag unless runOnly asks for it (the
  // rule metadata does not mark them disabled); the classifier still labels them in case a future axe changes that
  const experimental = rules.filter((r) => r.tags.includes('experimental'))
  assert.ok(experimental.length >= 5)
  for (const r of experimental) {
    assert.equal(grade(r).basis, 'experimental', r.id)
    assert.equal(grade(r).level, 'heuristic', r.id)
  }
  const wcagHigh = rules.filter((r) => isWcag(r) && high(r) && !r.tags.includes('experimental'))
  assert.ok(wcagHigh.length >= 40)
  for (const r of wcagHigh) {
    const g = grade(r)
    assert.equal(g.basis, 'wcag', r.id)
    assert.ok(g.criteria.length >= 1, `${r.id} names at least one success criterion (${r.tags.join(',')})`)
    if (truth.heuristicDespiteWcagHighImpact.includes(r.id)) {
      assert.equal(g.level, 'heuristic', r.id)
      assert.ok(g.note, `${r.id} says why it is not confirmed`)
    } else assert.equal(g.level, 'confirmed', r.id)
  }
  for (const r of rules.filter((r) => isWcag(r) && !high(r) && !r.tags.includes('experimental'))) assert.equal(grade(r).level, 'heuristic', r.id)
})

test('target-size is the WCAG 2.2 rule axe ships disabled; the tool enables it per viewport and keeps it heuristic', () => {
  const disabled22 = rules.filter((r) => r.enabled === false && r.tags.includes('wcag22aa')).map((r) => r.id)
  assert.deepEqual(disabled22, truth.wcag22RulesDisabledByDefault)
  const target = rules.find((r) => r.id === 'target-size')
  assert.ok(target.tags.includes('wcag258'))
  assert.deepEqual(grade(target).criteria, ['2.5.8'])
  assert.equal(grade(target).level, 'heuristic')
  const source = readFileSync(tool, 'utf8')
  assert.match(source, /rules: \{ 'target-size': \{ enabled: true \} \}/)
  assert.doesNotMatch(source, /region: \{ enabled: false \}/, 'the region rule is no longer disabled')
})
