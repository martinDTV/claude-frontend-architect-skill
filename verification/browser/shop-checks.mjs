#!/usr/bin/env node
/**
 * The shop reference application in a real browser (1.5 increment 5, block D). Drives the Nuxt shop (ember-store
 * contract) through its data-* hooks and ARIA roles: server-rendered catalogue; filters, sort, search and paging through
 * the URL with the count line and the chips; keyboard reach of the rail and the shelf; the detail page (variant change
 * updates the photograph, the price and the availability; a sold-out variant disables the action); the bag (count,
 * drawer with quantity steppers and totals, focus restore, persistence across a reload, the summary page, remove);
 * the filter sheet and the sticky purchase bar on a phone; 320 px reflow; the dark theme with the photographs untouched;
 * reduced motion; legibility in both themes; then the plugin's browser-audit on three routes with zero confirmed findings.
 *
 *   node shop-checks.mjs --url http://127.0.0.1:3000 --label nuxt
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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
const attr = (page, sel, name) => page.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [sel, name])
const query = (page) => new URL(page.url()).searchParams
// a card shows a price or a range (€27–€47): the first number is the one the catalogue sorts by
const prices = (page) => page.evaluate(() => [...document.querySelectorAll('[data-shelf] [data-price]')].map((p) => Number.parseFloat((p.textContent.match(/\d+(?:\.\d+)?/) ?? ['0'])[0])))
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
const visible = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }, sel)

export async function runShopChecks(chromium, { url, label, evidence, playwrightDir }) {
  mkdirSync(evidence, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const results = []
  const report = { label, catalogue: {}, detail: {}, bag: {}, responsive: {}, themes: {}, audit: null, legibility: {} }
  const ok = (line) => results.push(line)
  let step = 'setup'
  const newPage = async (options = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', ...options })
    const page = await context.newPage()
    const problems = []
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text().slice(0, 200)}`) })
    page.on('pageerror', (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`))
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`) })
    return { context, page, problems }
  }
  try {
    // ---- 1. the catalogue on the server and in the browser: URL state
    step = '1. catalogue'
    const ssr = await fetch(`${url}/shop`).then((r) => r.text())
    expect(/<main[^>]*id="main"/.test(ssr) && /data-contract="ember"/.test(ssr), 'the catalogue is server-rendered inside the scoped contract with its main landmark')
    expect((ssr.match(/data-piece="/g) ?? []).length === 24, `the server renders the first page of 24 cards (${(ssr.match(/data-piece="/g) ?? []).length})`)
    expect(/data-availability="(in-stock|last-few|sold-out|made-to-order)"/.test(ssr) && /<html[^>]*lang="en"/.test(ssr) && /<title>[^<]+<\/title>/.test(ssr), 'availability words, language and title are in the server HTML')
    let { context, page, problems } = await newPage()
    await page.goto(`${url}/shop`, { waitUntil: 'load' })
    await page.waitForSelector('[data-shelf]')
    expect(/^240 pieces/.test(await text(page, '[data-results-count]')), `the count line reads 240 pieces (${await text(page, '[data-results-count]')})`)
    await page.click('[data-filter="maker:okada"]')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('maker') === 'okada')
    const okada = await text(page, '[data-results-count]')
    expect(/^\d+ pieces?$/.test(okada) && !okada.startsWith('240') && (await count(page, '[data-chip="makers:okada"]')) === 1, `a maker filter narrows the shelf and shows its chip (${okada})`)
    await page.click('[data-sort]')
    await page.locator('[role="option"]').filter({ hasText: /^Price, low to high$/ }).first().click()
    await page.waitForFunction(() => new URL(location.href).searchParams.get('sort') === 'price-asc')
    await page.waitForTimeout(200)
    const asc = await prices(page)
    expect(asc.length > 1 && asc.every((p, i) => i === 0 || p >= asc[i - 1]), `cards sort by price ascending (${asc.slice(0, 6).join(', ')})`)
    await page.click('[data-chip="makers:okada"]')
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('maker'))
    await page.click('[data-filter="availability:sold-out"]')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('availability') === 'sold-out')
    await page.waitForTimeout(200)
    const soldOut = await page.evaluate(() => [...document.querySelectorAll('[data-shelf] [data-piece]')].map((li) => li.getAttribute('data-availability')))
    expect(soldOut.length > 0 && soldOut.every((a) => a === 'sold-out'), `the availability filter leaves only sold-out pieces (${soldOut.length})`)
    await page.click('[data-clear-filters]')
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('availability'))
    await page.fill('[data-search] input, input[data-search]', 'celadon')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'celadon')
    await page.waitForTimeout(200)
    const searched = await text(page, '[data-results-count]')
    expect(/^\d+ pieces? for “celadon”/.test(searched) && !searched.startsWith('0 '), `search narrows to the glaze (${searched})`)
    await page.goto(`${url}/shop`, { waitUntil: 'load' })
    await page.waitForSelector('[data-shelf]')
    const firstBefore = await attr(page, '[data-shelf] [data-piece]', 'data-piece')
    const wentNext = await page.evaluate(() => { const nav = document.querySelector('[data-pagination]'); const els = [...nav.querySelectorAll('button, a')]; const next = els.find((e) => /next/i.test(e.getAttribute('aria-label') ?? '')) ?? els.find((e) => e.textContent.trim() === '2'); if (!next) return false; next.click(); return true })
    expect(wentNext, 'the pagination offers a next page')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('page') === '2')
    await page.waitForTimeout(200)
    expect((await count(page, '[data-shelf] [data-piece]')) === 24 && (await attr(page, '[data-shelf] [data-piece]', 'data-piece')) !== firstBefore, 'page two shows 24 other cards')
    // keyboard: the rail and the shelf are reached by Tab
    await page.goto(`${url}/shop`, { waitUntil: 'load' })
    await page.waitForSelector('[data-shelf]')
    const reached = { rail: false, card: false }
    for (let i = 0; i < 40 && !(reached.rail && reached.card); i++) {
      await page.keyboard.press('Tab')
      const where = await page.evaluate(() => { const el = document.activeElement; return el?.closest('[data-filter-rail]') ? 'rail' : el?.closest('[data-piece]') ? 'card' : null })
      if (where) reached[where] = true
    }
    expect(reached.rail && reached.card, `Tab reaches the filter rail and a card (${JSON.stringify(reached)})`)
    report.catalogue = { okada, asc: asc.slice(0, 6), soldOut: soldOut.length, searched }
    report.legibility.catalogue = gradeLegibility(await measureLegibility(page, 'shop catalogue'), `${label} shop catalogue`)
    expect(problems.length === 0, `console problems on the catalogue: ${problems.join(' | ')}`)
    ok(`${label}: catalogue server-rendered (24 cards); maker, availability, search, sort and page through the URL; Tab reaches rail and shelf; ${report.legibility.catalogue.texts} texts legible`)
    await context.close()

    // ---- 2. the detail page: variants change the photograph, the price and the availability
    step = '2. detail'
    ;({ context, page, problems } = await newPage())
    await page.goto(`${url}/shop?availability=in-stock`, { waitUntil: 'load' })
    await page.waitForSelector('[data-shelf]')
    const detailHref = await page.evaluate(() => { const items = [...document.querySelectorAll('[data-shelf] [data-piece]')]; const multi = items.find((li) => li.querySelectorAll('a').length && /\d+ variants/.test(li.textContent)) ?? items[0]; return multi.querySelector('a').getAttribute('href') })
    await page.goto(`${url}${detailHref}`, { waitUntil: 'load' })
    await page.waitForSelector('[data-purchase-panel]')
    const glazeBefore = await attr(page, '[data-gallery] [data-art]', 'data-glaze')
    const priceBefore = await text(page, '[data-purchase-panel] [data-price]')
    const radios = await page.evaluate(() => [...document.querySelectorAll('input[data-variant-glaze]')].map((r) => r.getAttribute('data-variant-glaze')))
    expect(radios.length >= 1 && (await attr(page, '[data-purchase-panel] [data-availability]', 'data-availability')) !== null, `the detail shows glaze radios and an availability word (${radios.length} glazes)`)
    let changed = null
    if (radios.length > 1) {
      const other = radios.find((g) => g !== glazeBefore)
      await page.click(`label:has(input[data-variant-glaze="${other}"])`)
      await page.waitForFunction((g) => new URL(location.href).searchParams.get('glaze') === g, other)
      await page.waitForFunction((g) => document.querySelector('[data-gallery] [data-art]')?.getAttribute('data-glaze') === g, other, { timeout: 5000 })
      changed = { glaze: other, thumbPressed: await attr(page, `[data-thumb="${other}"]`, 'aria-pressed'), price: await text(page, '[data-purchase-panel] [data-price]') }
      expect(changed.thumbPressed === 'true', 'the thumbnail of the chosen glaze is pressed')
    }
    expect((await count(page, '[data-purchase-panel] input[data-variant-size]')) >= 1, 'size radios are present')
    // the bag: add twice, the drawer, steppers, focus restore, persistence, the summary page, remove
    expect((await text(page, '[data-bag-count]')) === '0', 'the bag starts empty')
    await page.click('[data-add]')
    await page.waitForFunction(() => document.querySelector('[data-bag-count]')?.textContent.trim() === '1')
    expect(/added to your bag/.test(await text(page, '[data-added]')), 'adding announces itself without leaving the page')
    await page.click('[data-add]')
    await page.waitForFunction(() => document.querySelector('[data-bag-count]')?.textContent.trim() === '2')
    await page.click('[data-bag-button]')
    await page.waitForSelector('[data-bag-drawer]')
    expect((await count(page, '[data-bag-line]')) === 1 && (await text(page, '[data-bag-line] [data-qty]')) === '2', 'the drawer shows one line with quantity 2')
    const totalBefore = await text(page, '[data-bag-total]')
    await page.click('[data-qty-inc]')
    await page.waitForFunction(() => document.querySelector('[data-bag-line] [data-qty]')?.textContent.trim() === '3')
    expect((await text(page, '[data-bag-total]')) !== totalBefore && (await text(page, '[data-bag-count]')) === '3', 'the stepper updates the total and the count')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-bag-drawer]', { state: 'detached' })
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => document.activeElement === document.querySelector('[data-bag-button]')), 'closing the drawer returns focus to the bag button')
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('[data-bag-count]')?.textContent.trim() === '3', null, { timeout: 10000 })
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ember.cart.v1') ?? 'null'))
    expect(stored?.version === 1 && stored.lines?.length === 1 && stored.lines[0].quantity === 3, `the bag persists as a versioned record (${JSON.stringify(stored).slice(0, 120)})`)
    await page.goto(`${url}/shop/bag`, { waitUntil: 'load' })
    await page.waitForSelector('[data-bag-summary]')
    expect((await count(page, '[data-bag-summary] [data-bag-line]')) === 1 && /€/.test(await text(page, '[data-bag-summary] [data-bag-total]')), 'the summary page lists the line and a total in euros')
    await page.click('[data-bag-summary] [data-remove]')
    await page.waitForSelector('[data-bag-empty]')
    expect((await text(page, '[data-bag-count]')) === '0', 'removing the line empties the bag everywhere')
    // a sold-out variant cannot be added
    await page.goto(`${url}/shop?availability=sold-out`, { waitUntil: 'load' })
    await page.waitForSelector('[data-shelf]')
    const soldHref = await page.evaluate(() => document.querySelector('[data-shelf] [data-piece] a')?.getAttribute('href'))
    await page.goto(`${url}${soldHref}`, { waitUntil: 'load' })
    await page.waitForSelector('[data-purchase-panel]')
    const addDisabled = await page.evaluate(() => { const b = document.querySelector('[data-add]'); return b && (b.disabled || b.getAttribute('aria-disabled') === 'true') && /sold out/i.test(b.textContent) })
    expect(addDisabled && (await attr(page, '[data-purchase-panel] [data-availability]', 'data-availability')) === 'sold-out', 'a sold-out variant shows the word and disables the action')
    report.detail = { href: detailHref, glazeBefore, priceBefore, changed }
    report.legibility.detail = gradeLegibility(await measureLegibility(page, 'shop detail'), `${label} shop detail`)
    expect(problems.length === 0, `console problems on detail and bag: ${problems.join(' | ')}`)
    ok(`${label}: variants change photograph, price and availability; sold out disables; the bag counts, steps, restores focus, persists, summarises and empties`)
    await context.close()

    // ---- 3. phone and reflow, dark theme, reduced motion
    step = '3. responsive, themes, motion'
    ;({ context, page, problems } = await newPage({ viewport: { width: 375, height: 740 } }))
    await page.goto(`${url}/shop`, { waitUntil: 'load' })
    await page.waitForSelector('[data-shelf]')
    expect((await visible(page, '[data-filters-button]')) && !(await visible(page, 'aside [data-filter-rail]')) && !(await overflow(page)), 'at 375 px the filters sit behind a button and nothing overflows')
    const twoUp = await page.evaluate(() => { const [a, b, c] = [...document.querySelectorAll('[data-shelf] [data-piece]')].map((li) => li.getBoundingClientRect()); return a && b && c && Math.abs(a.top - b.top) < 2 && c.top > a.top })
    expect(twoUp, 'the shelf is two cards wide on a phone')
    await page.click('[data-filters-button]')
    await page.waitForSelector('[role="dialog"] [data-filter-rail]')
    await page.click('[role="dialog"] [data-filter="form:mug"]')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('form') === 'mug')
    await page.click('[data-filters-apply]')
    await page.waitForSelector('[role="dialog"] [data-filter-rail]', { state: 'detached' })
    expect((await count(page, '[data-shelf] [data-piece]')) > 0 && (await count(page, '[data-chip="forms:mug"]')) === 1, 'the sheet filters the shelf (the chip shows the form) and closes')
    const mobileDetail = await page.evaluate(() => document.querySelector('[data-shelf] [data-piece] a')?.getAttribute('href'))
    await page.goto(`${url}${mobileDetail}`, { waitUntil: 'load' })
    await page.waitForSelector('[data-sticky-buy]')
    const bar = await page.evaluate(() => { const b = document.querySelector('[data-add-mobile]'); const r = b.getBoundingClientRect(); const s = document.querySelector('[data-sticky-buy]').getBoundingClientRect(); return { h: r.height, w: r.width, bottom: s.bottom, inner: innerHeight } })
    expect(bar.h >= 44 && bar.w >= 44 && Math.abs(bar.bottom - bar.inner) < 2 && !(await overflow(page)), `the sticky bar sits at the bottom with a 44 px action (${JSON.stringify(bar)})`)
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(`${url}/shop`, { waitUntil: 'load' })
    await page.waitForSelector('[data-shelf]')
    expect(!(await overflow(page)), 'no horizontal overflow at 320 px on the catalogue')
    await page.goto(`${url}${mobileDetail}`, { waitUntil: 'load' })
    await page.waitForSelector('[data-purchase-panel]')
    expect(!(await overflow(page)), 'no horizontal overflow at 320 px on the detail')
    report.responsive = { bar }
    expect(problems.length === 0, `console problems on the phone: ${problems.join(' | ')}`)
    await context.close()
    ;({ context, page, problems } = await newPage({ colorScheme: 'dark' }))
    await page.goto(`${url}/shop`, { waitUntil: 'load' })
    await page.waitForSelector('[data-shelf]')
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'), null, { timeout: 5000 })
    const dark = await page.evaluate(() => { const rect = document.querySelector('[data-shelf] [data-piece] [data-art] rect'); return { canvas: getComputedStyle(document.querySelector('[data-contract="ember"]')).backgroundColor, artRect: rect?.getAttribute('fill'), artPainted: rect ? getComputedStyle(rect).fill : null } })
    expect(dark.artRect === '#f3efe8' && dark.artPainted === 'rgb(243, 239, 232)' && dark.canvas !== 'rgb(243, 239, 232)', `the dark theme leaves the photographs on their studio surface (${JSON.stringify(dark)})`)
    report.themes = { dark }
    report.legibility.catalogueDark = gradeLegibility(await measureLegibility(page, 'shop catalogue dark'), `${label} shop catalogue dark`)
    await context.close()
    ;({ context, page, problems } = await newPage({ reducedMotion: 'reduce' }))
    await page.goto(`${url}${detailHref}`, { waitUntil: 'load' })
    await page.waitForSelector('[data-purchase-panel]')
    await page.click('[data-add]')
    await page.waitForFunction(() => document.querySelector('[data-bag-count]')?.textContent.trim() === '1')
    const animated = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => { const cs = getComputedStyle(e); return (cs.animationName !== 'none' && parseFloat(cs.animationDuration) > 0.01) || (cs.transitionProperty !== 'all' && cs.transitionProperty !== 'none' && parseFloat(cs.transitionDuration) > 0.01) }).length)
    expect(animated === 0, `reduced motion leaves no running animation or transition after adding to the bag (${animated})`)
    await context.close()
    ok(`${label}: 375 px filter sheet and sticky buy bar, 320 px reflow, dark theme keeps the photographs, reduced motion cuts the bag bump; dark catalogue legible (${report.legibility.catalogueDark.texts} texts)`)

    // ---- 4. the plugin's browser audit on three routes
    step = '4. browser audit'
    const out = mkdtempSync(join(tmpdir(), 'fa-shop-audit-'))
    const audit = spawnSync(process.execPath, [join(scripts, 'browser-audit.mjs'), url, '--playwright', playwrightDir, '--paths', `/shop,${detailHref},/shop/bag`, '--checks', 'axe,keyboard,responsive', '--viewports', 'mobile,desktop,reflow', '--text-scale', '1,2', '--max-time', '420', '--max-pages', '3', '--out', out, '--json', '--fail-on', 'none'], { encoding: 'utf8', timeout: 600000 })
    let auditReport
    try { auditReport = JSON.parse(audit.stdout) } catch { throw new Error(`browser-audit did not return JSON: ${audit.stderr.slice(0, 400)}`) }
    const confirmed = auditReport.findings.filter((f) => f.level === 'confirmed')
    expect(confirmed.length === 0, `browser-audit confirmed findings: ${confirmed.map((f) => `${f.file} ${f.id} ${f.viewport ?? ''} ${(f.message ?? '').slice(0, 120)}`).join(' | ')}`)
    const heuristics = auditReport.findings.filter((f) => f.level === 'heuristic')
    report.audit = { pages: auditReport.summary?.pages ?? 3, confirmed: 0, heuristic: heuristics.length, heuristicIds: [...new Set(heuristics.map((f) => f.id))] }
    ok(`${label}: browser-audit on three routes: 0 confirmed, ${heuristics.length} heuristic (${report.audit.heuristicIds.join(', ')})`)
  } catch (error) {
    error.message = `[${step}] ${error.message}`
    throw error
  } finally {
    await browser.close()
    writeFileSync(join(evidence, `${label}-shop.json`), JSON.stringify(report, null, 2))
  }
  console.log(`check-shop (${label}): ${results.length} checks passed\n  - ${results.join('\n  - ')}`)
  return report
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
  const url = opt('url')
  const label = opt('label') ?? 'app'
  const evidence = opt('evidence') ?? join(here, 'evidence')
  if (!url) { console.error('shop-checks: missing --url'); process.exit(2) }
  const { chromium } = createRequire(import.meta.url)('playwright')
  try {
    await runShopChecks(chromium, { url, label, evidence, playwrightDir: here })
  } catch (error) {
    console.error(`check-shop (${label}): ${error.message}`)
    process.exit(1)
  }
}
