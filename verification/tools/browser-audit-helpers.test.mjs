// 1.4.1: the pure helpers of browser-audit.mjs, testable without a browser. Importing the module does not run the
// tool (its main guard compares real paths); nothing here touches Playwright or axe-core.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { scriptsDir } from './helpers.mjs'

const { classifyAxeRule, formatCriterion, parseViewports } = await import(join(scriptsDir, 'browser-audit.mjs'))

test('axe grades: WCAG-tagged critical/serious rules are confirmed, best-practice rules are heuristic/low whatever their impact', () => {
  const contrast = classifyAxeRule({ id: 'color-contrast', impact: 'serious', tags: ['cat.color', 'wcag2aa', 'wcag143', 'TTv5', 'EN-301-549'] })
  assert.deepEqual(contrast, { basis: 'wcag', criteria: ['1.4.3'], level: 'confirmed', severity: 'high', note: null })
  const imageAlt = classifyAxeRule({ id: 'image-alt', impact: 'critical', tags: ['cat.text-alternatives', 'wcag2a', 'wcag111', 'section508'] })
  assert.equal(imageAlt.level, 'confirmed')
  assert.equal(imageAlt.severity, 'critical')
  // moderate WCAG rules stay heuristic (impact alone never confirms)
  const headingOrder = classifyAxeRule({ id: 'empty-heading', impact: 'minor', tags: ['cat.name-role-value', 'wcag2a', 'wcag412'] })
  assert.equal(headingOrder.level, 'heuristic')
  assert.equal(headingOrder.severity, 'low')
  // best practice: serious impact, still heuristic and low
  for (const id of ['tabindex', 'label-title-only', 'aria-dialog-name', 'accesskeys']) {
    const graded = classifyAxeRule({ id, impact: 'serious', tags: ['cat.keyboard', 'best-practice'] })
    assert.equal(graded.basis, 'best-practice', id)
    assert.equal(graded.level, 'heuristic', id)
    assert.equal(graded.severity, 'low', id)
    assert.deepEqual(graded.criteria, [], id)
  }
  const frameTested = classifyAxeRule({ id: 'frame-tested', impact: 'critical', tags: ['cat.structure', 'review-item', 'best-practice'] })
  assert.equal(frameTested.level, 'heuristic')
  const region = classifyAxeRule({ id: 'region', impact: 'moderate', tags: ['cat.keyboard', 'best-practice'] })
  assert.deepEqual([region.basis, region.level, region.severity], ['best-practice', 'heuristic', 'low'])
  const experimental = classifyAxeRule({ id: 'focus-order-semantics', impact: 'minor', tags: ['cat.keyboard', 'best-practice', 'experimental'] })
  assert.equal(experimental.basis, 'experimental')
  assert.equal(experimental.level, 'heuristic')
})

test('axe grades: target-size is WCAG 2.5.8 but stays heuristic because axe does not evaluate every exception', () => {
  const graded = classifyAxeRule({ id: 'target-size', impact: 'serious', tags: ['cat.sensory-and-visual-cues', 'wcag22aa', 'wcag258', 'EN-301-549v4'] })
  assert.equal(graded.basis, 'wcag')
  assert.deepEqual(graded.criteria, ['2.5.8'])
  assert.equal(graded.level, 'heuristic')
  assert.equal(graded.severity, 'medium')
  assert.match(graded.note, /equivalent-control, essential and user-agent-control exceptions/)
})

test('criterion tags become success criterion numbers; conformance-level tags do not', () => {
  assert.equal(formatCriterion('wcag143'), '1.4.3')
  assert.equal(formatCriterion('wcag1412'), '1.4.12')
  assert.equal(formatCriterion('wcag2411'), '2.4.11')
  assert.equal(formatCriterion('wcag258'), '2.5.8')
  assert.equal(formatCriterion('wcag412'), '4.1.2')
  assert.equal(formatCriterion('wcag111'), '1.1.1')
  for (const tag of ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice', 'cat.color', 'EN-301-549']) assert.equal(formatCriterion(tag), null, tag)
})

test('--viewports keeps the 1.4.0 presets and default, accepts WIDTHxHEIGHT tokens and the reflow preset, and reports unknown tokens', () => {
  const dflt = parseViewports(undefined)
  assert.deepEqual(dflt.names, ['mobile', 'tablet', 'desktop'])
  assert.deepEqual(dflt.sizes, { mobile: { width: 375, height: 667 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 800 } })
  assert.deepEqual(dflt.unknown, [])
  const custom = parseViewports('desktop,390x844,reflow,1920X1080')
  assert.deepEqual(custom.names, ['desktop', '390x844', 'reflow', '1920x1080'])
  assert.deepEqual(custom.sizes.reflow, { width: 320, height: 568 })
  assert.deepEqual(custom.sizes['390x844'], { width: 390, height: 844 })
  assert.deepEqual(custom.sizes['1920x1080'], { width: 1920, height: 1080 })
  const odd = parseViewports('phone, mobile ,12x12,desktop')
  assert.deepEqual(odd.names, ['mobile', 'desktop'])
  assert.deepEqual(odd.unknown, ['phone', '12x12'])
  assert.deepEqual(parseViewports('').names, [])
})
