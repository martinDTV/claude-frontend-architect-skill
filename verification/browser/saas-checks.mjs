#!/usr/bin/env node
/**
 * The enterprise reference application in a real browser (1.5 increment 5, block C). The same script drives the Nuxt
 * and the Next app through the DOM hooks both share (data-* attributes): server-rendered shell without hydration
 * warnings; the dashboard's five states driven by ?api=; the shipments table (sort with aria-sort, filters, search,
 * pagination, page size) with the URL as the state; the row actions (details slideover with focus restore, assign
 * dialog with validation and a server error, delivered with undo, cancel with a confirmation that names the
 * consequence); the form (error summary that takes focus, invalid fields named, a server conflict mapped to its field,
 * success with a redirect); preferences applied and persisted; the theme switch; Tab reach of the toolbar; 375 px
 * cards and 320 px reflow; re-entry; reduced motion; then the plugin's browser-audit on four routes with zero
 * confirmed findings.
 *
 *   node saas-checks.mjs --url http://127.0.0.1:3000 --label nuxt
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

const regionState = (page, region) => page.evaluate((r) => document.querySelector(`[data-region="${r}"]`)?.getAttribute('data-state'), region)
const waitRegion = (page, region, state, timeout = 30000) => page.waitForFunction(([r, s]) => document.querySelector(`[data-region="${r}"]`)?.getAttribute('data-state') === s, [region, state], { timeout })
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? null, sel)
const count = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel)
const query = (page) => new URL(page.url()).searchParams
const tableColumn = (page, key) => page.evaluate((k) => {
  const table = document.querySelector('[data-shipments-table] table') ?? document.querySelector('[data-shipments-table]')
  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim())
  const idx = headers.findIndex((h) => h.toLowerCase().startsWith(k.toLowerCase()))
  return [...table.querySelectorAll('tbody tr')].map((tr) => tr.children[idx]?.textContent?.trim() ?? '')
}, key)

export async function runSaasChecks(chromium, { url, label, evidence, playwrightDir }) {
  mkdirSync(evidence, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const results = []
  const report = { label, states: {}, table: {}, actions: {}, form: {}, preferences: {}, responsive: {}, audit: null, legibility: {} }
  const ok = (line) => results.push(line)
  let step = 'setup'
  const newPage = async (options = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', ...options })
    const page = await context.newPage()
    const problems = []
    page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /hydration/i.test(m.text()))) problems.push(`${m.type()}: ${m.text().slice(0, 200)}`) })
    page.on('pageerror', (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`))
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`) })
    return { context, page, problems }
  }
  try {
    // ---- 1. server render and the dashboard's states
    step = "1. server render and the dashboard's states"
    const ssr = await fetch(`${url}/app`).then((r) => r.text())
    expect(/<main[^>]*id="main"/.test(ssr), 'the dashboard is server-rendered with its main landmark')
    expect(/data-region="kpis"/.test(ssr) && /data-state="loading"/.test(ssr), 'the server renders the loading state of the data region (the data is client-fetched)')
    expect(/<html[^>]*lang="en"/.test(ssr) && /<title>[^<]+<\/title>/.test(ssr), 'the document has a language and a title')
    let { context, page, problems } = await newPage()
    await page.goto(`${url}/app`, { waitUntil: 'load' })
    await waitRegion(page, 'kpis', 'ready')
    const kpis = await page.evaluate(() => [...document.querySelectorAll('[data-kpi]')].map((a) => ({ id: a.getAttribute('data-kpi'), value: a.querySelector('[data-kpi-value]')?.textContent?.trim(), href: a.getAttribute('href') })))
    expect(kpis.length === 5 && kpis.every((k) => /^[\d,]+$/.test(k.value) && k.href.startsWith('/app/')), `five KPI tiles with numbers and links (${JSON.stringify(kpis)})`)
    const charts = await page.evaluate(() => [...document.querySelectorAll('[data-chart]')].map((f) => ({ id: f.getAttribute('data-chart'), img: Boolean(f.querySelector('[role="img"][aria-label]')), table: Boolean(f.querySelector('details table')), list: Boolean(f.querySelector('ol[aria-label]')) })))
    expect(charts.length === 2 && charts.every((c) => (c.img && c.table) || c.list), `two charts, each with an accessible alternative (${JSON.stringify(charts)})`)
    const exceptions = await count(page, '[data-exceptions] tbody tr')
    expect(exceptions > 0 && exceptions <= 8, `the exceptions table lists up to eight rows (${exceptions})`)
    await page.screenshot({ path: join(evidence, `${label}-saas-dashboard.png`), fullPage: true })
    // the grids answer to the text size (container units): five tiles across at 1280 px, fewer at 200% text, with the
    // tiles' words whole, the chart's axis labels at the reader's size and nothing overflowing
    const kpiColumns = () => page.evaluate(() => { const tops = [...document.querySelectorAll('[data-kpi]')].map((a) => Math.round(a.getBoundingClientRect().top)); return tops.filter((t) => t === tops[0]).length })
    const columnsAt1 = await kpiColumns()
    expect(columnsAt1 === 5, `the KPI tiles sit five across on a 1280 px desktop (${columnsAt1})`)
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    await page.waitForTimeout(400)
    const scaled = await page.evaluate(() => ({
      columns: (() => { const tops = [...document.querySelectorAll('[data-kpi]')].map((a) => Math.round(a.getBoundingClientRect().top)); return tops.filter((t) => t === tops[0]).length })(),
      clipped: [...document.querySelectorAll('[data-kpi]')].filter((a) => a.scrollWidth > a.clientWidth + 1).length,
      axisPx: Math.min(...[...document.querySelectorAll('[data-chart="deliveries"] [data-axis-label]')].map((e) => parseFloat(getComputedStyle(e).fontSize))),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }))
    expect(scaled.columns <= 3 && scaled.clipped === 0 && scaled.axisPx >= 20 && !scaled.overflow, `at 200% text the tiles drop to ${scaled.columns} columns with nothing clipped, the chart's axis labels follow the text (${scaled.axisPx}px) and nothing overflows (${JSON.stringify(scaled)})`)
    await page.evaluate(() => { document.documentElement.style.fontSize = '' })
    report.states.ready = { kpis, charts, exceptions, columnsAt1, scaled }
    report.legibility.dashboard = gradeLegibility(await measureLegibility(page, 'dashboard'), `${label} dashboard`)
    expect(problems.length === 0, `console problems on the dashboard: ${problems.join(' | ')}`)
    ok(`${label}: dashboard server-rendered, five KPIs five across (${scaled.columns} at 200% text, axis labels ${scaled.axisPx}px), two charts with alternatives, ${exceptions} exceptions; ${report.legibility.dashboard.texts} texts legible`)
    // empty, error (with retry), slow
    await page.goto(`${url}/app?api=empty`, { waitUntil: 'load' })
    await waitRegion(page, 'kpis', 'empty')
    expect(Boolean(await text(page, '[data-empty] a[href="/app/shipments/new"], [data-empty] a')), 'the empty state offers the next action')
    await page.goto(`${url}/app?api=fail`, { waitUntil: 'load' })
    await waitRegion(page, 'kpis', 'error')
    const errorText = await text(page, '[data-error]')
    expect(/could not be loaded/.test(errorText) && /req_[a-z0-9]+/.test(errorText), `the error names what happened and a request id (${errorText})`)
    expect(await page.evaluate(() => document.querySelector('[data-error]')?.closest('[role="alert"], [data-error][role="alert"]') !== null || document.querySelector('[data-error]')?.getAttribute('role') === 'alert'), 'the error is announced')
    await page.click('[data-error] button')
    await page.waitForTimeout(600)
    expect((await regionState(page, 'kpis')) === 'error', 'retry re-requests and the failure mode persists (the api is still failing)')
    await page.screenshot({ path: join(evidence, `${label}-saas-error.png`) })
    await page.goto(`${url}/app?api=slow`, { waitUntil: 'load' })
    await page.waitForTimeout(500)
    expect((await regionState(page, 'kpis')) === 'loading' && (await count(page, '[data-loading] [role="status"], [data-loading]')) > 0, 'a slow api shows the skeleton with a status role')
    await waitRegion(page, 'kpis', 'ready', 20000)
    report.states.modes = { empty: true, error: errorText, slow: true }
    ok(`${label}: empty state with its action, error with request id and retry, slow api shows the skeleton`)
    await context.close()

    // ---- 2. the shipments table: URL state, sort, filters, search, pagination

    step = "2. the shipments table: URL state, sort, filters, search, pagination"
    ;({ context, page, problems } = await newPage())
    await page.goto(`${url}/app/shipments`, { waitUntil: 'load' })
    await waitRegion(page, 'shipments', 'ready')
    expect((await count(page, '[data-shipments-table] tbody tr')) === 25, `25 rows on the first page (${await count(page, '[data-shipments-table] tbody tr')})`)
    expect(/Showing 1–25 of 400/.test(await text(page, '[data-result-count]')), `the result count reads "Showing 1–25 of 400" (${await text(page, '[data-result-count]')})`)
    await page.click('[data-sort="customer"]')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('sort') === 'customer:asc')
    const asc = await tableColumn(page, 'customer')
    expect(asc.length === 25 && [...asc].sort((a, b) => a.localeCompare(b)).join() === asc.join(), 'rows sort by customer ascending')
    const ariaSort = () => page.evaluate(() => document.querySelector('[data-sort="customer"]')?.closest('th')?.getAttribute('aria-sort') ?? null)
    expect((await ariaSort()) === 'ascending', `the column header announces ascending (${await ariaSort()})`)
    await page.click('[data-sort="customer"]')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('sort') === 'customer:desc')
    expect((await ariaSort()) === 'descending', `the column header announces descending (${await ariaSort()})`)
    // filter by status through the select menu
    await page.click('[data-filter-status]')
    await page.locator('[role="option"], [role="menuitemcheckbox"]').filter({ hasText: /^Late$/ }).first().click()
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('status') === 'late')
    const statuses = await page.evaluate(() => [...document.querySelectorAll('[data-shipments-table] tbody [data-status]')].map((b) => b.getAttribute('data-status')))
    expect(statuses.length > 0 && statuses.every((s) => s === 'late'), `every row is late after the filter (${statuses.length} rows)`)
    const lateTotal = await text(page, '[data-result-count]')
    await page.fill('[data-search] input, input[data-search]', 'ATL-26010')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'ATL-26010')
    await page.waitForTimeout(200)
    const searched = await count(page, '[data-shipments-table] tbody tr')
    expect(searched <= 1, `search narrows to the reference (${searched} rows; combined with the status filter it may be 0)`)
    await page.click('[data-clear-filters]')
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('status') && !new URL(location.href).searchParams.has('q'))
    await page.waitForTimeout(300)
    expect((await count(page, '[data-shipments-table] tbody tr')) === 25, 'clearing the filters restores the full first page')
    // pagination and page size
    const wentNext = await page.evaluate(() => { const nav = document.querySelector('[data-pagination]'); const els = [...nav.querySelectorAll('button, a')]; const next = els.find((e) => /next/i.test(e.getAttribute('aria-label') ?? '')) ?? els.find((e) => e.textContent.trim() === '2'); if (!next) return false; next.click(); return true })
    expect(wentNext, 'the pagination offers a next page control')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('page') === '2')
    expect(/Showing 26–50 of 400/.test(await text(page, '[data-result-count]')), `page two reads "Showing 26–50" (${await text(page, '[data-result-count]')})`)
    await page.click('[data-page-size]')
    await page.locator('[role="option"]').filter({ hasText: /^50 per page$/ }).first().click()
    await page.waitForFunction(() => new URL(location.href).searchParams.get('size') === '50')
    await page.waitForTimeout(200)
    expect((await count(page, '[data-shipments-table] tbody tr')) === 50 && !query(page).has('page'), 'page size 50 shows 50 rows and returns to the first page')
    report.table = { sort: 'customer asc/desc', filter: lateTotal, search: searched, pageSize: 50 }
    await page.screenshot({ path: join(evidence, `${label}-saas-table.png`), fullPage: false })
    report.legibility.table = gradeLegibility(await measureLegibility(page, 'table'), `${label} shipments table`)
    ok(`${label}: table sorts with aria-sort, filters (${lateTotal}), searches, pages and resizes through the URL`)

    // ---- 3. row actions

    step = "3. row actions"
    // an unassigned shipment that is not delivered: every action applies and the assign dialog starts empty; the
    // table is then narrowed to that reference so the row stays in view through assign, delivered and undo
    await page.goto(`${url}/app/shipments?assigned=no`, { waitUntil: 'load' })
    await waitRegion(page, 'shipments', 'ready')
    const firstRef = await page.evaluate(() => { const tr = [...document.querySelectorAll('[data-shipments-table] tbody tr')].find((r) => r.querySelector('[data-status]')?.getAttribute('data-status') !== 'delivered'); return tr?.querySelector('[data-row-actions]')?.getAttribute('data-row-actions') ?? null })
    expect(firstRef, 'an unassigned shipment that is not delivered exists to act on')
    await page.goto(`${url}/app/shipments?q=${firstRef}`, { waitUntil: 'load' })
    await waitRegion(page, 'shipments', 'ready')
    const trigger = `[data-row-actions="${firstRef}"]`
    await page.click(trigger)
    await page.getByRole('menuitem', { name: 'View details' }).click()
    await page.waitForSelector('[data-shipment-details]')
    expect((await page.getByRole('dialog').first().textContent()).includes(firstRef), 'the details slideover names the shipment')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-shipment-details]', { state: 'detached' })
    await page.waitForTimeout(200)
    const focusedAfterClose = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), trigger)
    expect(focusedAfterClose, 'closing the slideover returns focus to the row actions button')
    await page.click(trigger)
    await page.getByRole('menuitem', { name: 'Assign driver' }).click()
    await page.waitForSelector('[data-assign-driver]')
    await page.click('[data-assign-submit]')
    await page.waitForTimeout(200)
    expect(/Choose a driver/.test(await page.getByRole('dialog').first().textContent()), 'submitting without a driver shows the validation message')
    await page.click('[data-assign-driver]')
    await page.locator('[role="option"]').first().click()
    await page.click('[data-assign-submit]')
    await page.waitForFunction(() => [...document.querySelectorAll('[role="status"], [role="alert"], [data-sonner-toast], li')].some((e) => /Driver assigned/.test(e.textContent)), null, { timeout: 5000 })
    await page.waitForSelector('[data-assign-driver]', { state: 'detached' })
    await page.click(trigger)
    await page.getByRole('menuitem', { name: 'Mark delivered' }).click()
    await page.waitForFunction((ref) => { const row = [...document.querySelectorAll('[data-shipments-table] tbody tr')].find((tr) => tr.textContent.includes(ref)); return row && row.querySelector('[data-status="delivered"]') }, firstRef, { timeout: 5000 })
    await page.getByRole('button', { name: 'Undo' }).click()
    await page.waitForFunction((ref) => { const row = [...document.querySelectorAll('[data-shipments-table] tbody tr')].find((tr) => tr.textContent.includes(ref)); return row && !row.querySelector('[data-status="delivered"]') }, firstRef, { timeout: 5000 })
    await page.click(trigger)
    await page.getByRole('menuitem', { name: 'Cancel shipment' }).click()
    const confirmText = await page.getByRole('dialog').first().textContent()
    expect(confirmText.includes(firstRef) && /cannot be undone/.test(confirmText), 'the confirmation names the shipment and the consequence')
    await page.click('[data-confirm-cancel]')
    await page.waitForFunction((ref) => ![...document.querySelectorAll('[data-shipments-table] tbody tr')].some((tr) => tr.textContent.includes(ref)), firstRef, { timeout: 5000 })
    report.actions = { reference: firstRef, details: true, assign: true, delivered: 'undone', cancelled: true }
    expect(problems.length === 0, `console problems on the table: ${problems.join(' | ')}`)
    ok(`${label}: row actions: details with focus restore, assign with validation and success, delivered with undo, cancel with a named confirmation`)
    await context.close()

    // ---- 4. the form

    step = "4. the form"
    ;({ context, page, problems } = await newPage())
    await page.goto(`${url}/app/shipments/new`, { waitUntil: 'load' })
    await page.waitForSelector('[data-shipment-form]')
    await page.click('[data-submit]')
    await page.waitForSelector('[data-error-summary]')
    const summary = await text(page, '[data-error-summary]')
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-error-summary'), null, { timeout: 2000 }).catch(() => {})
    const summaryFocused = await page.evaluate(() => document.activeElement?.hasAttribute('data-error-summary'))
    const invalid = await count(page, '[data-shipment-form] [aria-invalid="true"]')
    expect(/Check \d+ fields?/.test(summary) && summaryFocused && invalid >= 4, `an empty submit focuses a summary naming the fields (${summary.slice(0, 60)}; focused ${summaryFocused}; ${invalid} invalid)`)
    // one line per field, the count equal to the lines, and the field's message in the summary's danger colour (not a hint)
    const lines = await page.evaluate(() => ({ count: Number((document.querySelector('[data-error-summary]')?.textContent.match(/Check (\d+)/) ?? [])[1]), items: [...document.querySelectorAll('[data-error-summary] li a')].map((a) => a.getAttribute('href')), danger: getComputedStyle(document.querySelector('[data-error-summary] p')).color }))
    expect(lines.count === lines.items.length && new Set(lines.items).size === lines.items.length, `the summary counts one line per field (${lines.count} vs ${lines.items.join(', ')})`)
    const fieldError = await page.evaluate(() => { const input = document.getElementById('field-reference'); const ids = (input?.getAttribute('aria-describedby') ?? '').split(/\s+/); const el = ids.map((id) => document.getElementById(id)).find((e) => e && /format ATL/.test(e.textContent)); return el ? { text: el.textContent.trim().slice(0, 40), color: getComputedStyle(el).color, body: getComputedStyle(document.body).color } : null })
    // (shadcn colours the whole invalid field, label included; what matters is that the message is not body text)
    expect(fieldError && fieldError.color === lines.danger && fieldError.color !== fieldError.body, `the field's message is described by the input and shares the summary's danger colour (${JSON.stringify(fieldError)} vs ${lines.danger})`)
    const fill = async (ref) => {
      await page.fill('#field-reference', ref)
      await page.fill('#field-customer', 'Norte Fresh')
      await page.fill('#field-promised', '2026-11-03')
      await page.fill('#field-weightKg', '1200')
      await page.fill('#field-pallets', '4')
    }
    await fill('ATL-26999')
    await page.click('[data-submit]')
    await page.waitForURL(/\/app\/shipments\?/, { timeout: 10000 })
    expect(query(page).get('q') === 'ATL-26999' && query(page).get('created') === 'ATL-26999', `success redirects to the table filtered by the new reference (${page.url()})`)
    await waitRegion(page, 'shipments', 'ready')
    expect((await count(page, '[data-created]')) === 1 && (await tableColumn(page, 'reference'))[0] === 'ATL-26999', 'the new shipment is announced and listed first')
    await page.goto(`${url}/app/shipments/new?api=fail`, { waitUntil: 'load' })
    await page.waitForSelector('[data-shipment-form]')
    await fill('ATL-26001')
    await page.click('[data-submit]')
    await page.waitForSelector('[data-error-summary]')
    const conflict = await text(page, '[data-error-summary]')
    const refInvalid = await page.getAttribute('#field-reference', 'aria-invalid')
    expect(/already exists/.test(conflict) && refInvalid === 'true', `a server conflict lands on the reference field (${conflict.slice(0, 80)}; aria-invalid ${refInvalid})`)
    report.form = { summary, invalid, created: 'ATL-26999', conflict }
    report.legibility.form = gradeLegibility(await measureLegibility(page, 'form'), `${label} form`)
    expect(problems.length === 0, `console problems on the form: ${problems.join(' | ')}`)
    ok(`${label}: form: summary takes focus with ${invalid} invalid fields named, valid submit creates and redirects, a 409 lands on its field`)
    await context.close()

    // ---- 5. preferences, theme, persistence

    step = "5. preferences, theme, persistence"
    ;({ context, page, problems } = await newPage())
    await page.goto(`${url}/app/settings`, { waitUntil: 'load' })
    await page.waitForSelector('[data-pref="density"]')
    await page.getByRole('radio', { name: /Comfortable/ }).check()
    await page.waitForFunction(() => document.documentElement.getAttribute('data-density') === 'comfortable')
    await page.click('[data-pref="theme"]')
    await page.locator('[role="option"]').filter({ hasText: /^Dark$/ }).first().click()
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
    await page.getByRole('checkbox', { name: 'Lane' }).uncheck()
    await page.waitForTimeout(200)
    const locked = await page.evaluate(() => ['Reference', 'Status'].map((name) => { const box = [...document.querySelectorAll('[data-pref="columns"] [role="checkbox"], [data-pref="columns"] input[type="checkbox"], [data-pref="columns"] button')].find((b) => (b.getAttribute('aria-label') ?? b.labels?.[0]?.textContent ?? document.querySelector(`label[for="${b.id}"]`)?.textContent ?? '').trim().startsWith(name) || document.querySelector(`label[for="${b.id}"]`)?.textContent.trim() === name); return box ? { name, disabled: box.disabled || box.getAttribute('aria-disabled') === 'true' || box.hasAttribute('data-disabled'), checked: box.checked || box.getAttribute('aria-checked') === 'true' || box.getAttribute('data-state') === 'checked' } : { name, missing: true } }))
    expect(locked.every((l) => l.disabled && l.checked), `the reference and status columns are checked and locked (${JSON.stringify(locked)})`)
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[data-pref="density"]')
    await page.waitForTimeout(400)
    const persisted = await page.evaluate(() => ({ density: document.documentElement.getAttribute('data-density'), dark: document.documentElement.classList.contains('dark'), stored: JSON.parse(localStorage.getItem('atlas.preferences.v1') ?? 'null') }))
    expect(persisted.density === 'comfortable' && persisted.dark && persisted.stored?.theme === 'dark' && !persisted.stored.columns.includes('lane'), `preferences persist across a reload (${JSON.stringify(persisted).slice(0, 160)})`)
    await page.goto(`${url}/app/shipments`, { waitUntil: 'load' })
    await waitRegion(page, 'shipments', 'ready')
    const headers = await page.evaluate(() => [...document.querySelectorAll('[data-shipments-table] thead th')].map((th) => th.textContent.trim()))
    expect(!headers.some((h) => /^Lane/.test(h)) && headers.some((h) => /^Reference/.test(h)), `the table follows the column preference (${headers.join(', ')})`)
    await page.screenshot({ path: join(evidence, `${label}-saas-table-dark.png`) })
    report.legibility.tableDark = gradeLegibility(await measureLegibility(page, 'table-dark'), `${label} table in dark`)
    report.preferences = persisted
    expect(problems.length === 0, `console problems on settings: ${problems.join(' | ')}`)
    ok(`${label}: density, theme and columns persist and apply; dark table legible (${report.legibility.tableDark.texts} texts)`)
    await context.close()

    // ---- 6. keyboard reach of the toolbar, re-entry, responsive, reduced motion

    step = "6. keyboard reach of the toolbar, re-entry, responsive, reduced motion"
    ;({ context, page, problems } = await newPage())
    await page.goto(`${url}/app/shipments?status=late`, { waitUntil: 'load' })
    await waitRegion(page, 'shipments', 'ready')
    const before = await count(page, '[data-shipments-table] tbody tr')
    const reached = []
    for (let i = 0; i < 40 && reached.length < 6; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => { const el = document.activeElement; const tb = el?.closest('[data-toolbar]'); return tb ? (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent.trim()).slice(0, 30) : null })
      if (info && !reached.includes(info)) reached.push(info)
    }
    expect(reached.length >= 4, `Tab reaches the toolbar controls (${reached.join(' | ')})`)
    // the search palette: the shortcut opens it, typing narrows it, Enter follows the item into the filtered table
    // the shortcut is a page shortcut: it is not taken while an input has focus (Tab left focus in the toolbar)
    await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); document.body.focus() })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
    const paletteInput = page.locator('[role="dialog"] input, [cmdk-input]').first()
    await paletteInput.waitFor({ state: 'visible', timeout: 5000 })
    await paletteInput.fill('ATL-26012')
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'ATL-26012', null, { timeout: 8000 })
    await waitRegion(page, 'shipments', 'ready')
    await page.waitForSelector('[role="dialog"] input', { state: 'detached', timeout: 3000 }).catch(() => {})
    expect((await count(page, '[data-shipments-table] tbody tr')) === 1 && (await page.locator('[role="dialog"] input').count()) === 0, `the palette narrows to the reference, Enter opens it in the table and the palette closes (${await count(page, '[data-shipments-table] tbody tr')} rows, ${await page.locator('[role="dialog"] input').count()} palette inputs)`)
    expect(problems.length === 0, `console problems after the palette: ${problems.join(' | ')}`)
    await page.goto(`${url}/app/shipments?status=late`, { waitUntil: 'load' })
    await waitRegion(page, 'shipments', 'ready')
    await page.click('a[href="/app/fleet"]')
    await page.waitForSelector('[data-vehicles]')
    await page.goBack({ waitUntil: 'load' })
    await waitRegion(page, 'shipments', 'ready')
    expect(query(page).get('status') === 'late' && (await count(page, '[data-shipments-table] tbody tr')) === before, 're-entry restores the URL state and the same rows')
    await context.close()
    ;({ context, page, problems } = await newPage({ viewport: { width: 375, height: 740 } }))
    await page.goto(`${url}/app/shipments`, { waitUntil: 'load' })
    await waitRegion(page, 'shipments', 'ready')
    const mobile = await page.evaluate(() => ({ cards: document.querySelectorAll('[data-shipments-cards] li').length, tableVisible: (() => { const t = document.querySelector('[data-shipments-table]'); return Boolean(t && t.getBoundingClientRect().width > 0 && getComputedStyle(t).display !== 'none') })(), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }))
    expect(mobile.cards === 25 && !mobile.tableVisible && !mobile.overflow, `375 px shows stacked cards, no table, no horizontal overflow (${JSON.stringify(mobile)})`)
    await page.screenshot({ path: join(evidence, `${label}-saas-mobile.png`), fullPage: false })
    await page.goto(`${url}/app`, { waitUntil: 'load' })
    await waitRegion(page, 'kpis', 'ready')
    const mobileDash = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, firstKpiTop: document.querySelector('[data-kpi]')?.getBoundingClientRect().top }))
    expect(!mobileDash.overflow && mobileDash.firstKpiTop < 740, `the dashboard keeps the first KPI above the fold on a phone without overflow (${JSON.stringify(mobileDash)})`)
    await context.close()
    ;({ context, page, problems } = await newPage({ viewport: { width: 320, height: 568 } }))
    await page.goto(`${url}/app/shipments`, { waitUntil: 'load' })
    await waitRegion(page, 'shipments', 'ready')
    expect(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), 'no horizontal overflow at 320 px')
    await context.close()
    ;({ context, page, problems } = await newPage({ reducedMotion: 'reduce' }))
    await page.goto(`${url}/app`, { waitUntil: 'load' })
    await waitRegion(page, 'kpis', 'ready')
    const animated = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => { const cs = getComputedStyle(e); return (cs.animationName !== 'none' && parseFloat(cs.animationDuration) > 0.01) || (cs.transitionProperty !== 'all' && cs.transitionProperty !== 'none' && parseFloat(cs.transitionDuration) > 0.01) }).length)
    expect(animated === 0, `reduced motion leaves no running animation or transition (${animated} elements)`)
    report.responsive = { toolbarReached: reached, mobile, mobileDash, reducedMotionAnimated: animated }
    ok(`${label}: Tab reaches ${reached.length} toolbar controls, the palette opens on the shortcut and lands in the table, re-entry keeps state, 375 px cards and 320 px reflow, reduced motion cuts everything`)
    await context.close()

    // ---- 7. the plugin's browser audit on four routes

    step = "7. the plugin's browser audit on four routes"
    const out = mkdtempSync(join(tmpdir(), 'fa-saas-audit-'))
    const audit = spawnSync(process.execPath, [join(scripts, 'browser-audit.mjs'), url, '--playwright', playwrightDir, '--paths', '/app,/app/shipments,/app/shipments/new,/app/settings', '--checks', 'axe,keyboard,responsive', '--viewports', 'mobile,desktop,reflow', '--text-scale', '1,2', '--max-time', '420', '--max-pages', '4', '--out', out, '--json', '--fail-on', 'none'], { encoding: 'utf8', timeout: 600000 })
    let auditReport
    try { auditReport = JSON.parse(audit.stdout) } catch { throw new Error(`browser-audit did not return JSON: ${audit.stderr.slice(0, 400)}`) }
    const confirmed = auditReport.findings.filter((f) => f.level === 'confirmed')
    expect(confirmed.length === 0, `browser-audit confirmed findings: ${confirmed.map((f) => `${f.file} ${f.id} ${f.viewport ?? ''} ${(f.message ?? '').slice(0, 90)}`).join(' | ')}`)
    const heur = auditReport.findings.filter((f) => f.level === 'heuristic')
    report.audit = { pages: auditReport.data?.pages?.map((p) => ({ url: p.url, coverage: p.checks?.axe?.coverage?.ratio ?? null, rulesRun: p.checks?.axe?.rulesRun ?? null })), heuristics: heur.map((f) => ({ id: f.id, file: f.file, viewport: f.viewport ?? null })) }
    ok(`${label}: browser-audit on four routes: 0 confirmed, ${heur.length} heuristic (${[...new Set(heur.map((f) => f.id))].join(', ') || 'none'})`)
  } catch (error) {
    error.message = `[${step}] ${error.message}`
    throw error
  } finally {
    await browser.close()
    writeFileSync(join(evidence, `${label}-saas.json`), JSON.stringify(report, null, 2))
  }
  console.log(`check-saas (${label}): ${results.length} checks passed\n  - ${results.join('\n  - ')}`)
  return report
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
  const url = opt('url')
  const label = opt('label') ?? 'app'
  const evidence = opt('evidence') ?? join(here, 'evidence')
  if (!url) { console.error('saas-checks: missing --url'); process.exit(2) }
  const { chromium } = createRequire(import.meta.url)('playwright')
  try {
    await runSaasChecks(chromium, { url, label, evidence, playwrightDir: here })
  } catch (error) {
    console.error(`check-saas (${label}): ${error.message}`)
    process.exit(1)
  }
}
