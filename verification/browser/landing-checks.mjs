#!/usr/bin/env node
/**
 * The launch page in a real browser (1.5 increment 5, block D): Lumen in the Next app (lumen-notebook contract).
 * Server render (one h1, the landmarks, the form, the art, the scoped contract); the intro and the scroll-bound strokes
 * through the page's own GSAP diagnostics; layout shift measured from the first paint; the finish radios; the pre-order
 * form's validation and success; keyboard reach; route change reverting every ScrollTrigger and re-entry; reduced
 * motion showing the final frames with no trigger; 375 px sticky bar and 320 px reflow; one-line idea headlines on a
 * desktop; the scoped roles in light and dark against the contract; legibility in both themes; then the plugin's
 * browser-audit with zero confirmed findings.
 *
 *   node landing-checks.mjs --url http://127.0.0.1:3000 --label next --contract ../design/contracts/lumen-notebook.json
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gradeLegibility, measureLegibility } from './lab-checks.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts')
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? null, sel)
const count = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel)
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
// when the page does overflow, name what sticks out (the message of a failed check must say where to look)
const overflowCulprits = (page) => page.evaluate(() => { const vw = document.documentElement.clientWidth; return { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, culprits: [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > vw + 1).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ').slice(0, 3).join('.')}@${Math.round(el.getBoundingClientRect().right)}`) } })
const lumen = (page) => page.evaluate(() => { const m = window.__lumen; return m ? { mounts: m.mounts, reverts: m.reverts, reduced: m.reduced, intro: m.intro, triggers: m.triggers(), tweens: m.tweens(), pinSpacers: document.querySelectorAll('.pin-spacer').length } : null })
const strokes = (page) => page.evaluate(() => [...document.querySelectorAll('#archive [data-stroke]')].map((p) => parseFloat(getComputedStyle(p).strokeDashoffset)))
const hex = (rgb) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb); return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : rgb }
const LAYOUT_SHIFT_OBSERVER = `window.__cls = 0; try { new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true }) } catch (e) {}`

export async function runLandingChecks(chromium, { url, label, evidence, playwrightDir, contractPath }) {
  mkdirSync(evidence, { recursive: true })
  const contract = contractPath ? JSON.parse(readFileSync(contractPath, 'utf8')) : null
  const { buildRamps, resolveRoles } = await import(join(scripts, 'design-contract.mjs'))
  const roles = contract ? resolveRoles(contract, buildRamps(contract)).roles : null
  const browser = await chromium.launch({ headless: true })
  const results = []
  const report = { label, server: {}, motion: {}, form: {}, responsive: {}, themes: {}, audit: null, legibility: {} }
  const ok = (line) => results.push(line)
  let step = 'setup'
  const newPage = async (options = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', reducedMotion: 'no-preference', ...options })
    const page = await context.newPage()
    await page.addInitScript(LAYOUT_SHIFT_OBSERVER)
    const problems = []
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 200)}`) })
    page.on('pageerror', (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`))
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`) })
    return { context, page, problems }
  }
  try {
    // ---- 1. the server render
    step = '1. server render'
    const ssr = await fetch(`${url}/landing`).then((r) => r.text())
    const h1s = (ssr.match(/<h1[\s>]/g) ?? []).length
    expect(h1s === 1 && /<main[^>]*id="main"/.test(ssr) && /data-contract="lumen"/.test(ssr), `one h1 and the main landmark inside the scoped contract (${h1s} h1)`)
    expect(/data-preorder-form/.test(ssr) && /data-art/.test(ssr) && /<title>Lumen/.test(ssr) && /<html[^>]*lang="en"/.test(ssr), 'the form, the product art and the title are in the server HTML')
    const sections = (ssr.match(/<section[^>]*aria-labelledby=/g) ?? []).length
    expect(sections >= 7, `every section is a labelled landmark (${sections})`)
    report.server = { h1s, sections, bytes: ssr.length }

    // ---- 2. the intro, the scroll-bound strokes, layout shift, the finish, the form, keyboard, route change
    step = '2. motion and interaction'
    let { context, page, problems } = await newPage()
    await page.goto(`${url}/landing`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__lumen?.intro === 'done', null, { timeout: 8000 })
    let s = await lumen(page)
    expect(s.mounts === 1 && s.reverts === 0 && s.reduced === false, `mounted once on the motion branch (${JSON.stringify(s)})`)
    expect(s.triggers >= 2, `the archive scrub and the battery fill are ScrollTriggers (${s.triggers})`)
    const coverOpen = await page.evaluate(() => /matrix3d|rotateY/.test(getComputedStyle(document.querySelector('[data-cover]')).transform) || document.querySelector('[data-cover]').style.transform.includes('rotateY'))
    expect(coverOpen, 'the cover opened (a 3D rotation is applied after the intro)')
    const before = await strokes(page)
    expect(before.length === 4 && before.every((v) => v > 0.9), `the archive strokes start undrawn (${before.map((v) => v.toFixed(2)).join(', ')})`)
    await page.evaluate(() => document.querySelector('#battery').scrollIntoView({ block: 'start' }))
    await page.waitForTimeout(1200)
    const after = await strokes(page)
    expect(after.every((v) => v < 0.05), `the strokes are drawn once the archive section has scrolled by (${after.map((v) => v.toFixed(2)).join(', ')})`)
    await page.waitForFunction(() => { const t = getComputedStyle(document.querySelector('[data-battery-fill]')).transform; return t === 'none' || /matrix\(1,/.test(t) }, null, { timeout: 4000 })
    const cls = await page.evaluate(() => window.__cls)
    expect(cls < 0.05, `cumulative layout shift from first paint through the intro and the scroll stays under 0.05 (${cls.toFixed(4)})`)
    // the finish radios change the product above
    await page.click('label:has(input[data-finish-option="moss"])')
    await page.waitForFunction(() => document.querySelector('[data-contract="lumen"]')?.getAttribute('data-finish') === 'moss')
    expect((await page.getAttribute('[data-art]', 'data-finish')) === 'moss', 'choosing a finish changes the notebook')
    // the form: empty submit, then a valid one
    await page.click('[data-preorder-submit]')
    await page.waitForSelector('[data-preorder-error]')
    const emailInvalid = await page.evaluate(() => { const i = document.querySelector('[data-preorder-email]'); return i.getAttribute('aria-invalid') === 'true' && document.activeElement === i && (i.getAttribute('aria-describedby') || '').split(' ').some((id) => document.getElementById(id)?.hasAttribute('data-preorder-error')) })
    expect(emailInvalid, 'an empty submit marks the email invalid, links the message and moves focus to the field')
    await page.fill('[data-preorder-email]', 'ada@studio.example')
    await page.click('[data-preorder-submit]')
    await page.waitForFunction(() => /Reserved/.test(document.querySelector('[data-preorder-done]')?.textContent ?? ''))
    expect(/Moss/.test(await text(page, '[data-preorder-done]')) && (await count(page, '[data-preorder-error]')) === 0, 'a valid submit confirms in a status region with the chosen finish')
    report.form = { done: await text(page, '[data-preorder-done]') }
    // keyboard: skip link first, then the header's pre-order link within a few tabs
    await page.goto(`${url}/landing`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__lumen?.intro === 'done', null, { timeout: 8000 })
    const order = []
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => { const el = document.activeElement; return `${el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}` })) }
    expect(order[0].startsWith('a:Skip to content') && order.some((o) => /Pre-order/.test(o)), `Tab reaches the skip link first and the pre-order link (${order.slice(0, 8).join(' → ')})`)
    const faqOpen = await page.evaluate(async () => { const d = document.querySelector('[data-faq]'); d.querySelector('summary').focus(); return d })
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => document.querySelector('[data-faq]').open), 'a question opens with Enter')
    // route change reverts every trigger and tween; re-entry mounts again
    const firstTriggers = s.triggers
    await page.click('footer a[href="/design"]')
    await page.waitForURL(/\/design$/)
    await page.waitForTimeout(400)
    s = await lumen(page)
    expect(s.reverts === 1 && s.triggers === 0 && s.pinSpacers === 0 && s.tweens === 0, `route change reverted the context (${JSON.stringify(s)})`)
    await page.goBack({ waitUntil: 'load' })
    await page.waitForFunction(() => window.__lumen?.intro === 'done' && window.__lumen.mounts === 2, null, { timeout: 8000 })
    s = await lumen(page)
    // the battery trigger fires once and removes itself: when the browser restores a scroll position past it, re-entry
    // legitimately holds one trigger fewer; what must not happen is zero (nothing recreated) or more (accumulation)
    expect(s.triggers >= 1 && s.triggers <= firstTriggers, `re-entry recreates the triggers without accumulating (${s.triggers} vs ${firstTriggers} on first mount)`)
    // one idea, one line: the headlines of the three ideas do not wrap on a desktop (R7)
    // the hero is the one sentence and may take two lines of display type; each idea's headline is one line (R7)
    const lines = await page.evaluate(() => ['#paper-title', '#archive-title', '#battery-title'].map((id) => { const el = document.querySelector(id); const cs = getComputedStyle(el); return { id, lines: Math.round(el.getBoundingClientRect().height / parseFloat(cs.lineHeight)) } }))
    expect(lines.every((l) => l.lines === 1), `idea headlines stay on one line at 1280 px (${lines.map((l) => `${l.id}:${l.lines}`).join(', ')})`)
    report.motion = { firstTriggers, strokesBefore: before, strokesAfter: after, cls }
    report.legibility.light = gradeLegibility(await measureLegibility(page, 'landing light'), `${label} landing light`)
    expect(problems.length === 0, `console problems: ${problems.join(' | ')}`)
    ok(`${label}: server render (1 h1, ${sections} sections); intro once, ${firstTriggers} triggers, strokes drawn by scroll, CLS ${cls.toFixed(3)}; finish, form validation and success; Tab order; route change reverts; headlines on one line; ${report.legibility.light.texts} texts legible`)
    await context.close()

    // ---- 3. reduced motion: final frames, no trigger
    step = '3. reduced motion'
    ;({ context, page, problems } = await newPage({ reducedMotion: 'reduce' }))
    await page.goto(`${url}/landing`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__lumen?.intro === 'done', null, { timeout: 8000 })
    s = await lumen(page)
    const drawn = await strokes(page)
    const animated = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => { const cs = getComputedStyle(e); return (cs.animationName !== 'none' && parseFloat(cs.animationDuration) > 0.01) || (cs.transitionProperty !== 'all' && cs.transitionProperty !== 'none' && parseFloat(cs.transitionDuration) > 0.01) }).length)
    expect(s.reduced === true && s.triggers === 0 && drawn.every((v) => v < 0.01) && animated === 0, `reduced motion: final frames, no ScrollTrigger, nothing running (${JSON.stringify({ ...s, drawn, animated })})`)
    ok(`${label}: reduced motion shows the notebook open, the strokes drawn and the battery full with no ScrollTrigger`)
    await context.close()

    // ---- 4. phone and reflow, dark theme against the contract
    step = '4. responsive and themes'
    ;({ context, page, problems } = await newPage({ viewport: { width: 375, height: 740 } }))
    await page.goto(`${url}/landing`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__lumen?.intro === 'done', null, { timeout: 8000 })
    const bar = await page.evaluate(() => { const a = document.querySelector('[data-preorder-bar] a'); const r = a.getBoundingClientRect(); const b = document.querySelector('[data-preorder-bar]').getBoundingClientRect(); return { h: r.height, w: r.width, atBottom: Math.abs(b.bottom - innerHeight) < 2, visible: r.width > 0 } })
    const art = await page.evaluate(() => { const r = document.querySelector('[data-art]').getBoundingClientRect(); return { ratio: r.width / r.height, w: r.width } })
    const phoneOverflow = await overflowCulprits(page)
    expect(bar.visible && bar.h >= 44 && bar.w >= 44 && bar.atBottom && phoneOverflow.scrollWidth <= phoneOverflow.clientWidth + 1, `the phone bar sits at the bottom with a 44 px pre-order action and nothing overflows (${JSON.stringify(bar)}; ${JSON.stringify(phoneOverflow)})`)
    expect(Math.abs(art.ratio - 4 / 3) < 0.02, `the product box keeps its 4:3 aspect on a phone (${art.ratio.toFixed(3)})`)
    // the bar repeats the one action: while the reservation form is in view it steps aside, and comes back
    await page.evaluate(() => document.querySelector('#preorder').scrollIntoView({ block: 'start' }))
    await page.waitForFunction(() => document.querySelector('[data-preorder-bar]')?.getBoundingClientRect().height === 0, null, { timeout: 3000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForFunction(() => document.querySelector('[data-preorder-bar]')?.getBoundingClientRect().height > 0, null, { timeout: 3000 })
    // 200% text on a phone: nothing overflows and the battery figures stack
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    await page.waitForTimeout(400)
    const scaled = await page.evaluate(() => { const figures = [...document.querySelectorAll('[data-battery-figures] > div')].map((d) => Math.round(d.getBoundingClientRect().top)); return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, figureRows: new Set(figures).size } })
    expect(!scaled.overflow && scaled.figureRows === 3, `at 200% text on a phone nothing overflows and the battery figures stack (${JSON.stringify(scaled)})`)
    await page.evaluate(() => { document.documentElement.style.fontSize = '' })
    await page.setViewportSize({ width: 320, height: 640 })
    await page.waitForTimeout(300)
    expect(!(await overflow(page)), 'no horizontal overflow at 320 px')
    report.responsive = { bar, art, scaled, cls375: await page.evaluate(() => window.__cls) }
    await context.close()
    ;({ context, page, problems } = await newPage({ colorScheme: 'dark' }))
    await page.goto(`${url}/landing`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__lumen?.intro === 'done', null, { timeout: 8000 })
    const dark = await page.evaluate(() => { const el = document.querySelector('[data-contract="lumen"]'); const cs = getComputedStyle(el); return { dark: document.documentElement.classList.contains('dark'), canvas: cs.backgroundColor, fg: cs.color } })
    if (roles) expect(dark.dark && hex(dark.canvas) === roles.dark.canvas.hex && hex(dark.fg) === roles.dark.fg.hex, `the dark roles of the scoped contract apply (${JSON.stringify(dark)} vs ${roles.dark.canvas.hex}/${roles.dark.fg.hex})`)
    report.themes = { dark, light: roles ? { canvas: roles.light.canvas.hex } : null }
    report.legibility.dark = gradeLegibility(await measureLegibility(page, 'landing dark'), `${label} landing dark`)
    expect(problems.length === 0, `console problems in dark: ${problems.join(' | ')}`)
    ok(`${label}: 375 px bar (aside while the form is in view) and 4:3 art box, 200% text and 320 px reflow, dark roles equal the contract's; dark page legible (${report.legibility.dark.texts} texts)`)
    await context.close()

    // ---- 5. the plugin's browser audit
    step = '5. browser audit'
    const out = mkdtempSync(join(tmpdir(), 'fa-landing-audit-'))
    const audit = spawnSync(process.execPath, [join(scripts, 'browser-audit.mjs'), url, '--playwright', playwrightDir, '--paths', '/landing', '--checks', 'axe,keyboard,responsive', '--viewports', 'mobile,desktop,reflow', '--text-scale', '1,2', '--max-time', '300', '--max-pages', '1', '--out', out, '--json', '--fail-on', 'none'], { encoding: 'utf8', timeout: 600000 })
    let auditReport
    try { auditReport = JSON.parse(audit.stdout) } catch { throw new Error(`browser-audit did not return JSON: ${audit.stderr.slice(0, 400)}`) }
    const confirmed = auditReport.findings.filter((f) => f.level === 'confirmed')
    expect(confirmed.length === 0, `browser-audit confirmed findings: ${confirmed.map((f) => `${f.file} ${f.id} ${f.viewport ?? ''} ${(f.message ?? '').slice(0, 120)}`).join(' | ')}`)
    const heuristics = auditReport.findings.filter((f) => f.level === 'heuristic')
    report.audit = { confirmed: 0, heuristic: heuristics.length, heuristicIds: [...new Set(heuristics.map((f) => f.id))] }
    ok(`${label}: browser-audit on /landing: 0 confirmed, ${heuristics.length} heuristic (${report.audit.heuristicIds.join(', ')})`)
  } catch (error) {
    error.message = `[${step}] ${error.message}`
    throw error
  } finally {
    await browser.close()
    writeFileSync(join(evidence, `${label}-landing.json`), JSON.stringify(report, null, 2))
  }
  console.log(`check-landing (${label}): ${results.length} checks passed\n  - ${results.join('\n  - ')}`)
  return report
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
  const url = opt('url')
  const label = opt('label') ?? 'app'
  const evidence = opt('evidence') ?? join(here, 'evidence')
  if (!url) { console.error('landing-checks: missing --url'); process.exit(2) }
  const { chromium } = createRequire(import.meta.url)('playwright')
  try {
    await runLandingChecks(chromium, { url, label, evidence, playwrightDir: here, contractPath: opt('contract') })
  } catch (error) {
    console.error(`check-landing (${label}): ${error.message}`)
    process.exit(1)
  }
}
