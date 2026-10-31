// Legibility grading (1.5 increment 4B): WCAG 2.2 thresholds by text size and weight, exact ratios from CSS on opaque
// chains, a guaranteed bound over every possible canvas colour under a translucent scrim, and a capture-based estimate
// only as the last resort. Node tests on synthetic records, then the fixture page in Chromium through the same
// collector the lab checks use.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { startFixtureServer } from './fixture/server.mjs'
import { decodePng } from '../../plugins/frontend-architect/skills/frontend-architect/scripts/lib/png.mjs'
import { collectTextRecords, contrast, contrastOn, cropPixels, estimateFromPixels, evaluateFocusIndicator, evaluateText, guaranteedContrast, hideTextIn, isLargeText, luminance, parseColor, parseGradientStops, parseShadowColors, requiredRatio } from './lib/legibility.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const rgba = (r, g, b, a = 1) => ({ r, g, b, a })
const WHITE = rgba(255, 255, 255)
const BLACK = rgba(0, 0, 0)
const CREAM = 'rgb(242, 239, 230)' // #f2efe6, the caption colour of the lab pages

test('colours: rgb, rgba, hex and keywords parse; gradients and shadows expose their colours', () => {
  assert.deepEqual(parseShadowColors('rgb(255, 210, 122) 0px 0px 0px 3px inset, rgba(8, 8, 12, 0.9) 0px 0px 0px 10px inset').map((c) => c.a), [1, 0.9])
  assert.deepEqual(parseColor('rgb(242, 239, 230)'), rgba(242, 239, 230, 1))
  assert.deepEqual(parseColor('rgba(8, 8, 12, 0.9)'), rgba(8, 8, 12, 0.9))
  assert.deepEqual(parseColor('#f2efe6'), rgba(242, 239, 230, 1))
  assert.deepEqual(parseColor('#fff'), rgba(255, 255, 255, 1))
  assert.deepEqual(parseColor('#00000080'), { r: 0, g: 0, b: 0, a: 128 / 255 })
  assert.deepEqual(parseColor('transparent'), rgba(0, 0, 0, 0))
  assert.equal(parseColor('currentcolor'), null)
  const stops = parseGradientStops('linear-gradient(90deg, rgba(8, 8, 12, 0.92), rgba(8, 8, 12, 0.4))')
  assert.deepEqual(stops.map((s) => s.a), [0.92, 0.4])
  assert.deepEqual(parseGradientStops('none'), [])
  // computed oklab/oklch colours (Tailwind v4, Nuxt UI, shadcn) convert to sRGB; white and black round-trip
  const white = parseColor('oklab(1 0 0)')
  assert.ok(Math.round(white.r) === 255 && Math.round(white.g) === 255 && Math.round(white.b) === 255)
  const faint = parseColor('oklab(0.475525 -0.0238236 -0.0978664 / 0.25)')
  assert.equal(faint.a, 0.25)
  assert.ok(faint.b > faint.r, 'a blue-ish oklab colour converts to a blue-ish sRGB colour')
  const viaLch = parseColor('oklch(0.6 0.15 250)')
  assert.ok(viaLch && viaLch.b > viaLch.r)
  assert.deepEqual(parseColor('color(srgb 1 0 0 / 0.5)'), { r: 255, g: 0, b: 0, a: 0.5 })
})

test('WCAG thresholds: 21:1 for white on black; large text at 24 px or 18.66 px bold needs 3:1, everything else 4.5:1', () => {
  assert.equal(Number(contrast(luminance(WHITE), luminance(BLACK)).toFixed(1)), 21)
  assert.equal(isLargeText(24, 400), true)
  assert.equal(isLargeText(23.9, 400), false)
  assert.equal(isLargeText(18.66, 700), true)
  assert.equal(isLargeText(18.66, 600), false)
  assert.equal(isLargeText(18, 700), false)
  assert.equal(requiredRatio({ fontSizePx: 16, fontWeight: 400 }), 4.5)
  assert.equal(requiredRatio({ fontSizePx: 24, fontWeight: 400 }), 3)
  assert.equal(requiredRatio({ fontSizePx: 19, fontWeight: 'bold' }), 3)
  assert.equal(requiredRatio({ kind: 'non-text' }), 3)
})

test('css method: an opaque chain gives the exact ratio, whatever sits under it', () => {
  const opaque = evaluateText({ color: CREAM, fontSize: 16, fontWeight: 400, stack: [{ color: 'rgb(21, 22, 28)', image: null }] })
  assert.equal(opaque.method, 'css')
  assert.ok(opaque.ratio > 13 && opaque.passes, JSON.stringify(opaque))
  // the opaque layer may be an ancestor: the chain is read from the element outward
  const nested = evaluateText({ color: CREAM, fontSize: 16, fontWeight: 400, stack: [{ color: 'rgba(0, 0, 0, 0)', image: null }, { color: 'rgb(21, 22, 28)', image: null }, { color: 'rgb(255, 255, 255)', image: null }] })
  assert.equal(nested.method, 'css')
  assert.ok(nested.ratio > 13)
  const dark = evaluateText({ color: 'rgb(28, 28, 34)', fontSize: 16, fontWeight: 400, stack: [{ color: 'rgb(244, 241, 234)', image: null }] })
  assert.equal(dark.method, 'css')
  assert.ok(dark.ratio > 12 && dark.passes)
  const weak = evaluateText({ color: 'rgb(150, 150, 150)', fontSize: 16, fontWeight: 400, stack: [{ color: 'rgb(255, 255, 255)', image: null }] })
  assert.equal(weak.method, 'css')
  assert.ok(weak.ratio < 4.5 && !weak.passes)
})

test('bound method: a 0.9 scrim guarantees 4.5:1 for light text over any colour; the worst base is white', () => {
  const text = parseColor(CREAM)
  const scrim = [{ color: parseColor('rgba(8, 8, 12, 0.9)'), image: null }]
  const bound = guaranteedContrast(text, scrim)
  assert.ok(bound.ratio >= 4.5, `bound ${bound.ratio}`)
  assert.deepEqual(bound.base, { r: 255, g: 255, b: 255 })
  // over black the same scrim is far better: the bound is the minimum, not the mean
  assert.ok(contrastOn(text, scrim, BLACK) > bound.ratio)
  const graded = evaluateText({ color: CREAM, fontSize: 16, fontWeight: 400, stack: [{ color: 'rgba(8, 8, 12, 0.9)', image: null }, { color: 'rgba(0, 0, 0, 0)', image: null }] })
  assert.equal(graded.method, 'bound')
  assert.ok(graded.passes && graded.ratio >= 4.5)
  // compositing happens in gamma space, so a dark scrim darkens white faster than linear intuition says: for this text
  // colour the guarantee holds from about 0.6 alpha (4.6:1) and 0.5 is clearly short (3.3:1)
  assert.ok(guaranteedContrast(text, [{ color: rgba(8, 8, 12, 0.5), image: null }]).ratio < 4.5)
  assert.ok(guaranteedContrast(text, [{ color: rgba(8, 8, 12, 0.65), image: null }]).ratio >= 4.5)
})

test('large text lowers the bar: a 0.5 scrim passes at 24 px (3:1) and fails at 16 px (4.5:1)', () => {
  const large = evaluateText({ color: CREAM, fontSize: 24, fontWeight: 400, stack: [{ color: 'rgba(8, 8, 12, 0.5)', image: null }] })
  assert.equal(large.method, 'bound')
  assert.ok(large.passes && large.required === 3 && large.large === true, JSON.stringify(large))
  const normal = evaluateText({ color: CREAM, fontSize: 16, fontWeight: 400, stack: [{ color: 'rgba(8, 8, 12, 0.5)', image: null }] })
  assert.equal(normal.method, 'bound')
  assert.ok(!normal.passes && normal.required === 4.5, JSON.stringify(normal))
})

test('gradient scrims count their least opaque stop; translucent chains fall back to the capture estimate', () => {
  const gradient = evaluateText({ color: CREAM, fontSize: 16, fontWeight: 400, stack: [{ color: 'rgba(0, 0, 0, 0)', image: 'linear-gradient(90deg, rgba(8, 8, 12, 0.92), rgba(8, 8, 12, 0.4))' }] })
  assert.equal(gradient.method, 'bound')
  assert.ok(!gradient.passes && gradient.ratio < 3, JSON.stringify(gradient))
  const bright = new Array(64 * 4).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 230)) // light pixels under the text
  const dark = new Array(64 * 4).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 10))
  const record = { color: CREAM, fontSize: 16, fontWeight: 400, stack: [{ color: 'rgba(8, 8, 12, 0.5)', image: null }] }
  const onBright = evaluateText(record, bright)
  assert.equal(onBright.method, 'estimate')
  assert.ok(!onBright.passes && onBright.bound < 4.5, JSON.stringify(onBright))
  const onDark = evaluateText(record, dark)
  assert.equal(onDark.method, 'estimate')
  assert.ok(onDark.passes && onDark.ratio > 10, JSON.stringify(onDark))
  const none = evaluateText(record, null)
  assert.equal(none.method, 'bound')
  assert.ok(!none.passes && /no capture/.test(none.note))
  const est = estimateFromPixels(parseColor(CREAM), [...bright, ...dark], { stride: 1 })
  assert.ok(est.min < 2 && est.p50 > 1, JSON.stringify(est))
})

test('transitional states are recorded, not graded; interactive flag carried through', () => {
  const fading = evaluateText({ color: CREAM, fontSize: 16, fontWeight: 400, opacity: 0.35, stack: [{ color: 'rgba(8, 8, 12, 0.9)', image: null }] })
  assert.equal(fading.transitional, true)
  assert.equal(fading.passes, true) // the chain itself is fine; the caller decides what a fading element means
  const button = evaluateText({ color: 'rgb(0, 0, 0)', fontSize: 13.33, fontWeight: 400, interactive: true, stack: [{ color: 'rgb(239, 239, 239)', image: null }] })
  assert.equal(button.interactive, true)
  assert.equal(button.method, 'css')
  assert.ok(button.passes)
})

test('focus indicators: none fails, user-agent auto is exempt, an author ring is graded against both sides', () => {
  assert.equal(evaluateFocusIndicator({ outline: { style: 'none', width: '0px', color: 'rgb(0, 0, 0)' }, stack: [] }).passes, false)
  const auto = evaluateFocusIndicator({ outline: { style: 'auto', width: '1px', color: 'rgb(16, 16, 16)' }, stack: [] })
  assert.equal(auto.indicator, 'user-agent')
  assert.equal(auto.passes, true)
  const onDark = evaluateFocusIndicator({ outline: { style: 'solid', width: '3px', color: 'rgb(255, 210, 122)' }, stack: [{ color: 'rgb(239, 239, 239)', image: null }, { color: 'rgba(8, 8, 12, 0.9)', image: null }] })
  assert.ok(onDark.passes && onDark.outside >= 3, JSON.stringify(onDark))
  const onWhite = evaluateFocusIndicator({ outline: { style: 'solid', width: '3px', color: 'rgb(255, 210, 122)' }, stack: [{ color: 'rgb(255, 255, 255)', image: null }, { color: 'rgb(255, 255, 255)', image: null }] })
  assert.ok(!onWhite.passes && onWhite.ratio < 3, JSON.stringify(onWhite))
})

test('a double inset ring grades its light line against its own dark band: readable over any frame', () => {
  const ring = evaluateFocusIndicator({ outline: { style: 'none', width: '0px', color: 'rgb(0, 0, 0)' }, ringShadow: 'rgb(255, 210, 122) 0px 0px 0px 3px inset, rgba(8, 8, 12, 0.9) 0px 0px 0px 10px inset', stack: [] })
  assert.equal(ring.indicator, 'author-double-ring')
  assert.ok(ring.passes && ring.ratio >= 3, JSON.stringify(ring))
  assert.equal(ring.method, 'bound') // the band is 0.9 alpha: the bound over every colour under it still passes
  const weak = evaluateFocusIndicator({ outline: { style: 'none', width: '0px', color: 'rgb(0, 0, 0)' }, ringShadow: 'rgb(255, 210, 122) 0px 0px 0px 3px inset, rgb(240, 230, 200) 0px 0px 0px 10px inset', stack: [] })
  assert.ok(!weak.passes, JSON.stringify(weak))
})

test('cropPixels clips to the image and keeps RGBA order', () => {
  const image = { width: 4, height: 2, pixels: new Array(4 * 2 * 4).fill(0).map((_, i) => i % 256) }
  const crop = cropPixels(image, { x: 3, y: 1, width: 5, height: 5 })
  assert.equal(crop.length, 4)
  assert.deepEqual(crop, [28, 29, 30, 31])
})

// ---- the fixture page in Chromium, through the collector the lab checks use ----

function toolingAvailable() {
  if (!existsSync(join(here, 'node_modules', 'playwright'))) return { ok: false, reason: 'playwright not installed in verification/browser (npm install)' }
  const probe = spawnSync(process.execPath, ['-e', "const {chromium}=require('playwright');chromium.launch({headless:true}).then(b=>b.close().then(()=>console.log('ok')),e=>{console.error(e.message.split('\\n')[0]);process.exit(1)})"], { cwd: here, encoding: 'utf8', timeout: 60000 })
  return probe.status === 0 ? { ok: true } : { ok: false, reason: `Chromium not launchable: ${probe.stderr.trim().slice(0, 160)}` }
}
const availability = toolingAvailable()
const required = process.env.FA_REQUIRE_BROWSER === '1'

test('fixture page: every case lands on the documented method and verdict', { skip: availability.ok || required ? false : availability.reason }, async () => {
  if (!availability.ok) assert.fail(`browser tooling required but unavailable: ${availability.reason}`)
  const { chromium } = createRequire(import.meta.url)('playwright')
  const { server, port } = await startFixtureServer()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    await page.goto(`http://127.0.0.1:${port}/legibility.html`, { waitUntil: 'load' })
    const records = await page.evaluate(collectTextRecords, 'main')
    const byCase = (name) => records.find((r) => r.selector.includes(`[data-case="${name}"]`))
    // one capture with the text hidden: the estimate reads what sits under each element
    const dir = mkdtempSync(join(tmpdir(), 'fa-legibility-'))
    await page.evaluate(hideTextIn, { selectors: ['[data-case]'], on: true })
    const shot = join(dir, 'hidden.png')
    await page.screenshot({ path: shot })
    await page.evaluate(hideTextIn, { on: false })
    const image = decodePng(readFileSync(shot))
    const grade = (name) => { const r = byCase(name); assert.ok(r, `record for ${name}`); return evaluateText(r, cropPixels(image, r.rect)) }
    const expectations = {
      'opaque-pass': { method: 'css', passes: true },
      'scrim-pass': { method: 'bound', passes: true },
      'scrim-fail': { method: 'estimate', passes: false },
      'scrim-dark-estimate': { method: 'estimate', passes: true },
      'large-pass': { method: 'bound', passes: true, required: 3 },
      'normal-on-50': { method: 'estimate', passes: false, required: 4.5 },
      'gradient-fail': { method: 'estimate', passes: false },
      'bold-large': { method: 'bound', passes: true, required: 3 },
      'dark-on-light': { method: 'css', passes: true },
      'flow-text': { method: 'css', passes: true },
    }
    for (const [name, expected] of Object.entries(expectations)) {
      const result = grade(name)
      assert.equal(result.method, expected.method, `${name}: method ${JSON.stringify(result)}`)
      assert.equal(result.passes, expected.passes, `${name}: verdict ${JSON.stringify(result)}`)
      if (expected.required) assert.equal(result.required, expected.required, `${name}: required`)
      assert.equal(result.transitional, false, `${name} is not transitional`)
    }
    assert.equal(grade('fading').transitional, true, 'the fading caption is transitional')
    assert.equal(byCase('flow-text').overMedia, false, 'flow text is not over the canvas')
    assert.equal(byCase('scrim-pass').overMedia, true, 'the overlays are over the canvas')
    // the select's value is the text it shows; a user-agent button text on its own background is exact from CSS
    const select = byCase('select')
    assert.ok(select && select.text === 'oxblood' && evaluateText(select).method === 'css' && evaluateText(select).passes, JSON.stringify(select))
    // focus: the author ring on the HUD passes against the scrim; the control without any indicator fails
    await page.focus('[data-case="hud-button"]')
    const focusedHud = (await page.evaluate(collectTextRecords, 'main')).find((r) => r.focused)
    assert.ok(focusedHud && focusedHud.selector.includes('hud-button'), 'the HUD button is focused')
    const hudRing = evaluateFocusIndicator(focusedHud)
    assert.ok(hudRing.indicator === 'author' && hudRing.passes && hudRing.outside >= 3, JSON.stringify(hudRing))
    await page.focus('[data-case="stage-ring"]')
    const focusedStage = (await page.evaluate(collectTextRecords, 'main')).find((r) => r.focused)
    assert.ok(focusedStage && focusedStage.ringShadow, 'the focused stage without text is recorded with its ring')
    const stageRing = evaluateFocusIndicator(focusedStage)
    assert.ok(stageRing.indicator === 'author-double-ring' && stageRing.passes, JSON.stringify(stageRing))
    await page.focus('[data-case="no-focus"]')
    const focusedNone = (await page.evaluate(collectTextRecords, 'main')).find((r) => r.focused)
    const noRing = evaluateFocusIndicator(focusedNone)
    assert.equal(noRing.passes, false, JSON.stringify(noRing))
    assert.equal(noRing.indicator, 'none')
  } finally {
    await browser.close()
    server.close()
  }
})
