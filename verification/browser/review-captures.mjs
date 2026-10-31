#!/usr/bin/env node
/**
 * Release-candidate visual review captures (1.5.0, increment 6). Serves the production builds of the Nuxt and Next
 * verification apps and photographs the three reference products (Atlas in both libraries, Lumen, Ember) in light and
 * dark, at desktop, tablet, mobile and 320 px, at 100% and 200% text, in their loading, empty and error states, with
 * forms in error, menus, dialogs, drawers and sheets open. Also runs the plugin's browser-audit on every route with
 * its JSON kept, so each heuristic can be triaged from its evidence. Nothing here asserts: it produces the material a
 * reviewer (a person, or a fresh-context agent) grades with the rubric. Output: an index.json and PNGs under --out.
 *
 *   node review-captures.mjs --out evidence/review-rc [--nuxt-url ... --next-url ...]
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts')
const argv = process.argv.slice(2)
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback }
const out = opt('out', join(here, 'evidence', 'review-rc'))
mkdirSync(out, { recursive: true })

const freePort = () => new Promise((resolve) => { const srv = createServer(); srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) }) })
const servers = []
async function serveNuxt() {
  if (opt('nuxt-url')) return opt('nuxt-url')
  const dir = join(here, '..', 'nuxt')
  if (!existsSync(join(dir, '.output', 'server', 'index.mjs'))) throw new Error('no Nuxt build (.output); run `npx nuxt build` in verification/nuxt')
  const port = await freePort()
  const p = spawn(process.execPath, [join(dir, '.output', 'server', 'index.mjs')], { cwd: dir, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: 'ignore', detached: true })
  servers.push(p)
  return `http://127.0.0.1:${port}`
}
async function serveNext() {
  if (opt('next-url')) return opt('next-url')
  const dir = join(here, '..', 'next')
  if (!existsSync(join(dir, '.next', 'BUILD_ID'))) throw new Error('no Next build (.next); run `npx next build` in verification/next')
  const port = await freePort()
  const p = spawn(join(dir, 'node_modules', '.bin', 'next'), ['start', '-p', String(port), '-H', '127.0.0.1'], { cwd: dir, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'ignore', detached: true })
  servers.push(p)
  return `http://127.0.0.1:${port}`
}
const stop = () => { for (const p of servers) { try { process.kill(-p.pid, 'SIGTERM') } catch { /* gone */ } } }
process.on('exit', stop)
async function waitFor(url, path) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(url + path); if (r.ok) return } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${url}${path} did not answer`)
}

const VIEWPORTS = { desktop: { width: 1280, height: 800 }, tablet: { width: 820, height: 1180 }, mobile: { width: 375, height: 740 }, reflow: { width: 320, height: 640 } }
const index = []
const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ headless: true })

async function shot(name, { url, viewport = 'desktop', theme = 'light', scale = 1, fullPage = true, reducedMotion = 'no-preference', ready, act, note }) {
  const file = `${name}.png`
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], colorScheme: theme, reducedMotion })
  const page = await context.newPage()
  const problems = []
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 160)) })
  page.on('pageerror', (e) => problems.push(`pageerror ${String(e.message).slice(0, 160)}`))
  try {
    await page.goto(url, { waitUntil: 'load' })
    if (ready) await ready(page)
    if (scale !== 1) { await page.evaluate((s) => { document.documentElement.style.fontSize = `${s * 100}%` }, scale); await page.waitForTimeout(400) }
    if (act) await act(page)
    await page.waitForTimeout(250)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    await page.screenshot({ path: join(out, file), fullPage, animations: 'disabled' })
    index.push({ file, url: new URL(url).pathname + new URL(url).search, viewport, theme, scale, fullPage, overflow, consoleErrors: problems, note: note ?? null })
    process.stdout.write(`  ${file}${overflow ? '  (horizontal overflow)' : ''}${problems.length ? `  (${problems.length} console error)` : ''}\n`)
  } catch (error) {
    index.push({ file, url, viewport, theme, scale, error: String(error.message).slice(0, 200), note: note ?? null })
    process.stdout.write(`  ${file}  FAILED: ${String(error.message).slice(0, 120)}\n`)
  } finally {
    await context.close()
  }
}

const region = (name, state) => (page) => page.waitForFunction(([r, s]) => document.querySelector(`[data-region="${r}"]`)?.getAttribute('data-state') === s, [name, state], { timeout: 30000 })
const settle = (ms) => (page) => page.waitForTimeout(ms)

async function captureAtlas(label, base) {
  process.stdout.write(`\n== Atlas (${label}) at ${base}\n`)
  for (const theme of ['light', 'dark']) {
    for (const viewport of ['desktop', 'tablet', 'mobile', 'reflow']) {
      await shot(`${label}-app-dashboard-${viewport}-${theme}`, { url: `${base}/app`, viewport, theme, ready: region('kpis', 'ready') })
      await shot(`${label}-app-shipments-${viewport}-${theme}`, { url: `${base}/app/shipments`, viewport, theme, ready: region('shipments', 'ready') })
    }
    await shot(`${label}-app-shipments-new-desktop-${theme}`, { url: `${base}/app/shipments/new`, viewport: 'desktop', theme, ready: (p) => p.waitForSelector('[data-shipment-form]') })
    await shot(`${label}-app-shipments-new-mobile-${theme}`, { url: `${base}/app/shipments/new`, viewport: 'mobile', theme, ready: (p) => p.waitForSelector('[data-shipment-form]') })
    await shot(`${label}-app-settings-desktop-${theme}`, { url: `${base}/app/settings`, viewport: 'desktop', theme, ready: (p) => p.waitForSelector('[data-pref="density"]') })
    await shot(`${label}-design-desktop-${theme}`, { url: `${base}/design`, viewport: 'desktop', theme, ready: settle(600) })
  }
  // text at 200%
  await shot(`${label}-app-dashboard-desktop-light-200`, { url: `${base}/app`, viewport: 'desktop', scale: 2, ready: region('kpis', 'ready') })
  await shot(`${label}-app-shipments-mobile-light-200`, { url: `${base}/app/shipments`, viewport: 'mobile', scale: 2, ready: region('shipments', 'ready') })
  await shot(`${label}-app-shipments-new-reflow-light-200`, { url: `${base}/app/shipments/new`, viewport: 'reflow', scale: 2, ready: (p) => p.waitForSelector('[data-shipment-form]') })
  // states
  await shot(`${label}-app-dashboard-loading-desktop-light`, { url: `${base}/app?api=slow`, viewport: 'desktop', fullPage: false, ready: settle(400), note: 'skeleton while the slow api answers' })
  await shot(`${label}-app-dashboard-error-desktop-light`, { url: `${base}/app?api=fail`, viewport: 'desktop', ready: region('kpis', 'error') })
  await shot(`${label}-app-dashboard-empty-desktop-light`, { url: `${base}/app?api=empty`, viewport: 'desktop', ready: region('kpis', 'empty') })
  await shot(`${label}-app-shipments-error-mobile-dark`, { url: `${base}/app/shipments?api=fail`, viewport: 'mobile', theme: 'dark', ready: region('shipments', 'error') })
  // interactions: filter menu, row actions, details panel, assign dialog, form errors, search palette
  await shot(`${label}-app-shipments-filter-menu-desktop-light`, { url: `${base}/app/shipments`, viewport: 'desktop', fullPage: false, ready: region('shipments', 'ready'), act: async (p) => { await p.click('[data-filter-status]'); await p.waitForTimeout(400) }, note: 'status filter open' })
  await shot(`${label}-app-shipments-row-menu-desktop-light`, { url: `${base}/app/shipments?assigned=no`, viewport: 'desktop', fullPage: false, ready: region('shipments', 'ready'), act: async (p) => { await p.click('[data-row-actions]'); await p.waitForTimeout(400) }, note: 'row actions open' })
  await shot(`${label}-app-shipments-details-desktop-dark`, { url: `${base}/app/shipments?assigned=no`, viewport: 'desktop', theme: 'dark', fullPage: false, ready: region('shipments', 'ready'), act: async (p) => { await p.click('[data-row-actions]'); await p.getByRole('menuitem', { name: 'View details' }).click(); await p.waitForSelector('[data-shipment-details]'); await p.waitForTimeout(500) }, note: 'details panel' })
  await shot(`${label}-app-shipments-assign-dialog-desktop-light`, { url: `${base}/app/shipments?assigned=no`, viewport: 'desktop', fullPage: false, ready: region('shipments', 'ready'), act: async (p) => { await p.click('[data-row-actions]'); await p.getByRole('menuitem', { name: 'Assign driver' }).click(); await p.waitForSelector('[data-assign-driver]'); await p.click('[data-assign-submit]'); await p.waitForTimeout(400) }, note: 'assign dialog with its validation message' })
  await shot(`${label}-app-shipments-cancel-confirm-mobile-light`, { url: `${base}/app/shipments?assigned=no`, viewport: 'mobile', fullPage: false, ready: region('shipments', 'ready'), act: async (p) => { await p.locator('[data-shipments-cards] li button').first().click(); await p.waitForTimeout(500) }, note: 'phone card action (details)' })
  await shot(`${label}-app-shipments-new-errors-desktop-light`, { url: `${base}/app/shipments/new`, viewport: 'desktop', ready: (p) => p.waitForSelector('[data-shipment-form]'), act: async (p) => { await p.click('[data-submit]'); await p.waitForSelector('[data-error-summary]'); await p.waitForTimeout(300) }, note: 'empty submit: summary and field errors' })
  await shot(`${label}-app-shipments-new-conflict-mobile-dark`, { url: `${base}/app/shipments/new?api=fail`, viewport: 'mobile', theme: 'dark', ready: (p) => p.waitForSelector('[data-shipment-form]'), act: async (p) => { await p.fill('#field-reference', 'ATL-26001'); await p.fill('#field-customer', 'Norte Fresh'); await p.fill('#field-promised', '2026-11-03'); await p.fill('#field-weightKg', '1200'); await p.fill('#field-pallets', '4'); await p.click('[data-submit]'); await p.waitForSelector('[data-error-summary]'); await p.waitForTimeout(300) }, note: 'server conflict on the reference' })
  await shot(`${label}-app-search-palette-desktop-light`, { url: `${base}/app`, viewport: 'desktop', fullPage: false, ready: region('kpis', 'ready'), act: async (p) => { await p.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k'); await p.waitForTimeout(500) }, note: 'search palette (⌘K)' })
  await shot(`${label}-app-sidebar-collapsed-desktop-light`, { url: `${base}/app`, viewport: 'desktop', fullPage: false, ready: region('kpis', 'ready'), act: async (p) => { const t = await p.$('[data-sidebar-toggle], [data-sidebar-collapse]'); if (t) { await t.click(); await p.waitForTimeout(500) } }, note: 'sidebar collapsed to icons' })
  await shot(`${label}-app-mobile-drawer-mobile-light`, { url: `${base}/app`, viewport: 'mobile', fullPage: false, ready: region('kpis', 'ready'), act: async (p) => { const t = p.locator('[data-sidebar-toggle], button[aria-label="Open sidebar"], button[aria-label="Toggle sidebar"]').locator('visible=true').first(); await t.click(); await p.waitForTimeout(600) }, note: 'navigation drawer on a phone' })
}

async function captureLumen(base) {
  process.stdout.write(`\n== Lumen at ${base}\n`)
  const intro = (p) => p.waitForFunction(() => window.__lumen?.intro === 'done', null, { timeout: 10000 })
  for (const theme of ['light', 'dark']) for (const viewport of ['desktop', 'tablet', 'mobile', 'reflow']) await shot(`lumen-landing-${viewport}-${theme}`, { url: `${base}/landing`, viewport, theme, ready: intro })
  await shot('lumen-landing-desktop-light-200', { url: `${base}/landing`, viewport: 'desktop', scale: 2, ready: intro })
  await shot('lumen-landing-mobile-light-200', { url: `${base}/landing`, viewport: 'mobile', scale: 2, ready: intro })
  await shot('lumen-landing-hero-before-intro-desktop-light', { url: `${base}/landing`, viewport: 'desktop', fullPage: false, reducedMotion: 'reduce', ready: intro, note: 'reduced motion: the final frame at once' })
  await shot('lumen-landing-archive-scrolled-desktop-light', { url: `${base}/landing`, viewport: 'desktop', fullPage: false, ready: intro, act: async (p) => { await p.evaluate(() => document.querySelector('#battery').scrollIntoView({ block: 'start' })); await p.waitForTimeout(900); await p.evaluate(() => document.querySelector('#archive').scrollIntoView({ block: 'center' })); await p.waitForTimeout(500) }, note: 'archive section after the strokes drew' })
  await shot('lumen-landing-form-error-mobile-light', { url: `${base}/landing`, viewport: 'mobile', fullPage: false, ready: intro, act: async (p) => { await p.evaluate(() => document.querySelector('#preorder').scrollIntoView()); await p.click('[data-preorder-submit]'); await p.waitForSelector('[data-preorder-error]'); await p.waitForTimeout(300) }, note: 'form error on a phone with the bar' })
  await shot('lumen-landing-form-success-desktop-dark', { url: `${base}/landing`, viewport: 'desktop', theme: 'dark', fullPage: false, ready: intro, act: async (p) => { await p.evaluate(() => document.querySelector('#preorder').scrollIntoView()); await p.click('label:has(input[data-finish-option="moss"])'); await p.fill('[data-preorder-email]', 'ada@studio.example'); await p.click('[data-preorder-submit]'); await p.waitForFunction(() => /Reserved/.test(document.querySelector('[data-preorder-done]')?.textContent ?? '')); await p.waitForTimeout(300) }, note: 'moss finish chosen, success message' })
  await shot('lumen-landing-faq-open-mobile-dark', { url: `${base}/landing`, viewport: 'mobile', theme: 'dark', fullPage: false, ready: intro, act: async (p) => { await p.evaluate(() => { const d = document.querySelector('[data-faq]'); d.open = true; d.scrollIntoView({ block: 'start' }) }); await p.waitForTimeout(300) }, note: 'a question open' })
}

async function captureEmber(base) {
  process.stdout.write(`\n== Ember at ${base}\n`)
  const shelf = (p) => p.waitForSelector('[data-shelf]')
  for (const theme of ['light', 'dark']) for (const viewport of ['desktop', 'tablet', 'mobile', 'reflow']) await shot(`ember-shop-${viewport}-${theme}`, { url: `${base}/shop`, viewport, theme, ready: shelf })
  await shot('ember-shop-desktop-light-200', { url: `${base}/shop`, viewport: 'desktop', scale: 2, ready: shelf })
  await shot('ember-shop-mobile-light-200', { url: `${base}/shop`, viewport: 'mobile', scale: 2, ready: shelf })
  await shot('ember-shop-filtered-desktop-light', { url: `${base}/shop?maker=okada&availability=last-few`, viewport: 'desktop', ready: shelf, note: 'two filters, chips, count line' })
  await shot('ember-shop-no-match-desktop-light', { url: `${base}/shop?q=zzzz`, viewport: 'desktop', ready: (p) => p.waitForSelector('[data-no-match]'), note: 'nothing on this shelf' })
  await shot('ember-shop-filter-sheet-mobile-light', { url: `${base}/shop`, viewport: 'mobile', fullPage: false, ready: shelf, act: async (p) => { await p.click('[data-filters-button]'); await p.waitForSelector('[role="dialog"] [data-filter-rail]'); await p.waitForTimeout(400) }, note: 'filter sheet on a phone' })
  // a detail with several glazes, light and dark, desktop and mobile
  const detailPath = '__DETAIL__'
  index.push({ marker: 'detail-path', value: detailPath })
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop })
  const page = await context.newPage()
  await page.goto(`${base}/shop?availability=in-stock`, { waitUntil: 'load' })
  await page.waitForSelector('[data-shelf]')
  const href = await page.evaluate(() => { const items = [...document.querySelectorAll('[data-shelf] [data-piece]')]; const multi = items.find((li) => /\d+ variants/.test(li.textContent)) ?? items[0]; return multi.querySelector('a').getAttribute('href') })
  await context.close()
  index[index.length - 1].value = href
  for (const theme of ['light', 'dark']) {
    await shot(`ember-detail-desktop-${theme}`, { url: `${base}${href}`, viewport: 'desktop', theme, ready: (p) => p.waitForSelector('[data-purchase-panel]') })
    await shot(`ember-detail-mobile-${theme}`, { url: `${base}${href}`, viewport: 'mobile', theme, ready: (p) => p.waitForSelector('[data-purchase-panel]') })
  }
  await shot('ember-detail-reflow-light-200', { url: `${base}${href}`, viewport: 'reflow', scale: 2, ready: (p) => p.waitForSelector('[data-purchase-panel]') })
  await shot('ember-detail-other-glaze-desktop-light', { url: `${base}${href}`, viewport: 'desktop', ready: (p) => p.waitForSelector('[data-purchase-panel]'), act: async (p) => { const radios = await p.$$('input[data-variant-glaze]'); if (radios.length > 1) { const v = await radios[1].getAttribute('data-variant-glaze'); await p.click(`label:has(input[data-variant-glaze="${v}"])`); await p.waitForTimeout(600) } }, note: 'second glaze chosen' })
  await shot('ember-bag-drawer-desktop-light', { url: `${base}${href}`, viewport: 'desktop', fullPage: false, ready: (p) => p.waitForSelector('[data-purchase-panel]'), act: async (p) => { await p.click('[data-add]'); await p.click('[data-add]'); await p.click('[data-bag-button]'); await p.waitForSelector('[data-bag-drawer]'); await p.waitForTimeout(500) }, note: 'bag drawer with one line, quantity 2' })
  await shot('ember-bag-drawer-mobile-dark', { url: `${base}${href}`, viewport: 'mobile', theme: 'dark', fullPage: false, ready: (p) => p.waitForSelector('[data-purchase-panel]'), act: async (p) => { await p.click('[data-add-mobile]'); await p.click('[data-bag-button]'); await p.waitForSelector('[data-bag-drawer]'); await p.waitForTimeout(500) }, note: 'bag drawer on a phone, dark' })
  await shot('ember-bag-page-desktop-light', { url: `${base}${href}`, viewport: 'desktop', ready: (p) => p.waitForSelector('[data-purchase-panel]'), act: async (p) => { await p.click('[data-add]'); await p.goto(`${base}/shop/bag`, { waitUntil: 'load' }); await p.waitForSelector('[data-bag-summary]'); await p.waitForTimeout(300) }, note: 'the bag reviewed' })
  await shot('ember-bag-empty-mobile-light', { url: `${base}/shop/bag`, viewport: 'mobile', ready: (p) => p.waitForSelector('[data-bag-empty]') })
  // a sold-out detail
  const ctx2 = await browser.newContext({ viewport: VIEWPORTS.desktop })
  const p2 = await ctx2.newPage()
  await p2.goto(`${base}/shop?availability=sold-out`, { waitUntil: 'load' })
  await p2.waitForSelector('[data-shelf]')
  const sold = await p2.evaluate(() => document.querySelector('[data-shelf] [data-piece] a')?.getAttribute('href'))
  await ctx2.close()
  await shot('ember-detail-sold-out-desktop-light', { url: `${base}${sold}`, viewport: 'desktop', ready: (p) => p.waitForSelector('[data-purchase-panel]'), note: 'sold out: the word and the disabled action' })
}

async function audit(label, base, paths) {
  const file = join(out, `audit-${label}.json`)
  const r = spawnSync(process.execPath, [join(scripts, 'browser-audit.mjs'), base, '--playwright', here, '--paths', paths.join(','), '--checks', 'axe,keyboard,responsive', '--viewports', 'mobile,desktop,reflow', '--text-scale', '1,2', '--max-time', '600', '--max-pages', String(paths.length), '--out', join(out, `audit-${label}-out`), '--json', '--fail-on', 'none'], { encoding: 'utf8', timeout: 900000 })
  writeFileSync(file, r.stdout || JSON.stringify({ error: r.stderr.slice(0, 2000) }))
  let summary = null
  try { const j = JSON.parse(r.stdout); summary = { confirmed: j.findings.filter((f) => f.level === 'confirmed').length, heuristic: j.findings.filter((f) => f.level === 'heuristic').length, info: j.findings.filter((f) => f.level === 'info').length } } catch { summary = { error: true } }
  process.stdout.write(`  audit ${label}: ${JSON.stringify(summary)} -> ${file}\n`)
  index.push({ audit: label, file: `audit-${label}.json`, summary })
}

try {
  const nuxt = await serveNuxt()
  const next = await serveNext()
  await waitFor(nuxt, '/shop')
  await waitFor(next, '/landing')
  await captureAtlas('nuxt', nuxt)
  await captureAtlas('next', next)
  await captureLumen(next)
  await captureEmber(nuxt)
  const detail = index.find((i) => i.marker === 'detail-path')?.value ?? '/shop'
  if (!argv.includes('--no-audit')) {
    await audit('nuxt', nuxt, ['/design', '/app', '/app/shipments', '/app/shipments/new', '/app/settings', '/shop', detail, '/shop/bag'])
    await audit('next', next, ['/design', '/app', '/app/shipments', '/app/shipments/new', '/app/settings', '/landing'])
  }
} finally {
  await browser.close()
  stop()
  writeFileSync(join(out, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), captures: index }, null, 2))
  const failed = index.filter((i) => i.error).length
  process.stdout.write(`\n${index.filter((i) => i.file && !i.audit).length} captures (${failed} failed) under ${out}\n`)
}
