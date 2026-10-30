#!/usr/bin/env node
// Browser-mode audit (opt-in): drives a real Chromium through Playwright against an authorised URL and
// reports what only a rendered page can show: axe-core violations, keyboard reachability, dialog focus
// management, form behaviour (validation feedback, pending state, double submissions, success
// confirmation), responsive layout defects per viewport, hydration warnings, and visual regressions
// against approved baselines. Everything here is explicit: the tooling directory, the allowed hosts,
// the interactions, the output directory, the time budget.
//
// Trust and safety (see docs/ui-verification.md):
//   - never runs unless --playwright <dir> names a directory you control that provides playwright (and axe-core);
//   - only localhost targets by default; other hosts need --allow-host; every request to a host outside the
//     allowlist is blocked at the network layer and counted;
//   - no authentication, no cookies or storage state; a login wall is reported as auth-required; forms with a
//     password field are never submitted (form-skipped-credentials);
//   - clicks only with --interact and never on buttons whose text looks destructive; submits forms only with
//     --allow-submit (fixtures and staging); writes only under --out (screenshots need --screenshots);
//   - evidence keeps selectors, roles and short messages, never form values; elements matching --mask are
//     masked in screenshots and omitted from text evidence.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { addFinding, finish, isMainModule, parseArgs, TOOL_VERSION, usage } from './lib/report.mjs'
import { decodePng, diffImages } from './lib/png.mjs'

const HELP = `
browser-audit — rendered-page checks with Playwright and axe-core (opt-in, explicit authorisation).

usage: node browser-audit.mjs <url> --playwright <dir> [options]
  --playwright <dir>      directory whose node_modules provides playwright (and axe-core); required
  --axe <dir|file>        axe-core location when it is not next to playwright (default: same dir)
  --paths </a,/b>         page paths to visit under the url (default: the url itself)
  --checks <list>         axe,keyboard,dialogs,responsive,hydration,forms,visual (default: axe,keyboard,dialogs,responsive,hydration)
  --viewports <list>      mobile,tablet,desktop (default all three; responsive and visual checks run per viewport)
  --text-scale <list>     font-size scales for responsive checks (default 1,1.25)
  --allow-host <hosts>    comma-separated hosts allowed besides localhost/127.0.0.1 (the target host must be allowed)
  --interact              click non-destructive buttons to discover dialogs and menus
  --allow-submit          fill and submit forms (validation, pending state, double submission, confirmation)
  --max-time <s>          overall budget in seconds (default 90)
  --max-pages <n>         pages visited at most (default 10)
  --out <dir>             output directory for evidence (default: a new directory under the OS temp dir)
  --screenshots           save masked screenshots per page and viewport under --out
  --mask <selectors>      comma-separated selectors masked in screenshots and omitted from evidence
                          (default: input[type=password],[data-sensitive],[data-fa-mask])
  --baseline-dir <dir>    visual regression: approved baselines (visual check); never written implicitly
  --write-baseline        write a baseline only when none exists for that page/viewport
  --approve <names>       replace existing baselines for these names (page@viewport), explicitly
  --visual-threshold <r>  differing-pixel ratio above which a difference is a regression (default 0.001)
  --freeze-time <iso>     freeze Date in the page for deterministic rendering
  --json | --md           output format
  --fail-on <level>       exit 1 on: confirmed (default) | any | none

Levels: confirmed = observed in the rendered page (an axe violation of impact critical/serious, a second request on
a double click, focus left outside an open dialog); heuristic = observed but context may justify it; info = evidence.
Passing axe is not WCAG conformance: reading order, meaningful alternatives, timing and cognitive criteria need a human.
`

const VIEWPORTS = { mobile: { width: 375, height: 667 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 800 } }
const DESTRUCTIVE_RE = /\b(delete|remove|destroy|pay|purchase|buy|send|submit|confirm|archive|publish|reset|revoke|logout|sign out|borrar|eliminar|quitar|pagar|comprar|enviar|confirmar|archivar|publicar|cerrar sesi[oó]n)\b/i
const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

function loadTooling(dir, axeOverride) {
  const base = isAbsolute(dir) ? dir : resolve(dir)
  const req = createRequire(join(base, 'package.json'))
  let playwright
  try {
    playwright = req('playwright')
  } catch (error) {
    return { error: `playwright not resolvable from ${base} (${error.code ?? error.message}); install it there: npm install playwright && npx playwright install chromium` }
  }
  let axeSource = null
  let axeVersion = null
  try {
    const axeFile = axeOverride ? (axeOverride.endsWith('.js') ? resolve(axeOverride) : createRequire(join(resolve(axeOverride), 'package.json')).resolve('axe-core/axe.min.js')) : req.resolve('axe-core/axe.min.js')
    axeSource = readFileSync(axeFile, 'utf8')
    axeVersion = /axe-core\s+v?(\d+\.\d+\.\d+)/.exec(axeSource.slice(0, 400))?.[1] ?? null
    if (!axeVersion) {
      try {
        axeVersion = JSON.parse(readFileSync(join(dirname(axeFile), 'package.json'), 'utf8')).version
      } catch {
        /* unknown version */
      }
    }
  } catch {
    axeSource = null
  }
  let playwrightVersion = null
  try {
    playwrightVersion = JSON.parse(readFileSync(req.resolve('playwright/package.json'), 'utf8')).version
  } catch {
    /* unknown */
  }
  return { playwright, playwrightVersion, axeSource, axeVersion, dir: base }
}

function hostAllowed(hostname, allowed) {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || allowed.has(h)
}

/** A directory the tool may write to: under the working directory or the OS temp dir (symlinks resolved, path-segment aware). */
function safeDir(given, flag, { create }) {
  const dir = given ? resolve(given) : join(tmpdir(), `fa-browser-${Date.now()}`)
  const real = (p) => {
    try {
      return realpathSync(p)
    } catch {
      return p
    }
  }
  const candidate = real(existsSync(dir) ? dir : dirname(dir)) + (existsSync(dir) ? '' : `/${basename(dir)}`)
  const inside = (base) => candidate === base || candidate.startsWith(base.endsWith('/') ? base : `${base}/`)
  // allowed roots: the working directory, the OS temp dir, and /tmp when it exists (macOS keeps them apart)
  const roots = [real(process.cwd()), real(tmpdir()), ...(existsSync('/tmp') ? [real('/tmp')] : [])]
  if (!roots.some(inside)) throw new Error(`${flag} must be under the current directory or the OS temp dir (got ${dir})`)
  if (create) mkdirSync(dir, { recursive: true })
  return dir
}
const safeOutDir = (out) => safeDir(out, '--out', { create: true })

// ---------------------------------------------------------------- in-page helpers (serialised into the page)
const PAGE_HELPERS = `
window.__fa = {
  selector(el) {
    if (!el || el === document) return 'document'
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase()
      const id = typeof node.getAttribute === 'function' ? node.getAttribute('id') : '' // not node.id: a form child named "id" shadows it
      if (id) { parts.unshift(part + '#' + id); break }
      const cls = [...node.classList].slice(0, 2).map((c) => '.' + c).join('')
      const role = node.getAttribute('role') ? '[role=' + node.getAttribute('role') + ']' : ''
      parts.unshift(part + cls + role)
      node = node.parentElement
    }
    return parts.join(' > ')
  },
  visible(el) {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
  },
  focusables() { return [...document.querySelectorAll(${JSON.stringify(FOCUSABLE)})].filter((e) => window.__fa.visible(e)) },
  insideScroller(el) {
    let n = el.parentElement
    while (n) {
      if (n.hasAttribute('data-allow-overflow')) return true
      const s = getComputedStyle(n)
      if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth) return true
      n = n.parentElement
    }
    return false
  },
  name(el) {
    return (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && [...el.getAttribute('aria-labelledby').split(/\\s+/)].map((id) => document.getElementById(id)?.textContent || '').join(' ')) || el.textContent || el.getAttribute('title') || '').trim().slice(0, 60)
  },
}`

export async function run(argv) {
  const args = parseArgs(argv, { booleans: ['interact', 'allow-submit', 'screenshots', 'write-baseline', 'json', 'md'] })
  if (args.help || !args._[0]) return usage(HELP)
  if (!args.playwright) return failNow('--playwright <dir> is required: the browser mode never loads tooling from the audited project or from a global install')
  let target
  try {
    target = new URL(args._[0])
  } catch {
    return failNow(`not a URL: ${args._[0]}`)
  }
  const allowed = new Set(String(args['allow-host'] ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
  if (!hostAllowed(target.hostname, allowed)) return failNow(`target host ${target.hostname} is not allowed; the browser mode targets localhost by default. Pass --allow-host ${target.hostname} only for environments you are authorised to test (never production by default)`)
  const tooling = loadTooling(String(args.playwright), args.axe ? String(args.axe) : null)
  if (tooling.error) return failNow(tooling.error)
  const checks = new Set(String(args.checks ?? 'axe,keyboard,dialogs,responsive,hydration').split(',').map((s) => s.trim()).filter(Boolean))
  for (const c of checks) if (!['axe', 'keyboard', 'dialogs', 'responsive', 'hydration', 'forms', 'visual'].includes(c)) return failNow(`unknown check: ${c}`)
  if (checks.has('forms') && !args['allow-submit']) return failNow('the forms check submits forms: pass --allow-submit (fixtures and staging only)')
  if (checks.has('visual') && !args['baseline-dir']) return failNow('the visual check needs --baseline-dir <dir>')
  let baselineDir = null
  if (checks.has('visual')) {
    try {
      baselineDir = safeDir(String(args['baseline-dir']), '--baseline-dir', { create: false })
    } catch (error) {
      return failNow(error.message)
    }
  }
  if (checks.has('axe') && !tooling.axeSource) return failNow(`axe-core not found next to playwright in ${tooling.dir}; install it there or pass --axe <dir>`)
  const viewports = String(args.viewports ?? 'mobile,tablet,desktop').split(',').map((s) => s.trim()).filter((v) => VIEWPORTS[v])
  const textScales = String(args['text-scale'] ?? '1,1.25').split(',').map(Number).filter((n) => n > 0)
  const maxTime = Number(args['max-time'] ?? 90) * 1000
  const maxPages = Number(args['max-pages'] ?? 10)
  const masks = String(args.mask ?? 'input[type=password],[data-sensitive],[data-fa-mask]').split(',').map((s) => s.trim()).filter(Boolean)
  let outDir
  try {
    outDir = safeOutDir(args.out)
  } catch (error) {
    return failNow(error.message)
  }
  const paths = args.paths ? String(args.paths).split(',').map((s) => s.trim()).filter(Boolean) : [target.pathname + target.search]
  const deadline = Date.now() + maxTime
  const timeLeft = () => Math.max(0, deadline - Date.now())

  const report = { tool: 'browser-audit', version: TOOL_VERSION, root: target.origin, framework: 'browser', generatedAt: new Date().toISOString(), config: null, summary: {}, findings: [], notes: [], data: { pages: [], blockedRequests: [], screenshots: [], visual: [] }, analysis: { mode: 'browser', playwright: tooling.playwrightVersion, axe: tooling.axeVersion, browser: null, viewports, textScales, checks: [...checks], interact: Boolean(args.interact), allowSubmit: Boolean(args['allow-submit']), allowedHosts: [...allowed], budgets: { maxTimeMs: maxTime, maxPages }, outDir, baselineDir } }
  const emit = (f) => addFinding(report, { verification: 'browser', ...f })

  const { chromium } = tooling.playwright
  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (error) {
    return failNow(`could not launch Chromium through ${tooling.dir}: ${String(error.message).split('\n')[0]}. Run: npx playwright install chromium (in that directory)`)
  }
  report.analysis.browser = { name: browser.browserType().name(), version: browser.version(), platform: process.platform, node: process.version }
  const context = await browser.newContext({ viewport: VIEWPORTS[viewports[0]] ?? VIEWPORTS.desktop, reducedMotion: 'reduce', locale: 'en-US' })
  context.setDefaultTimeout(Math.min(10000, timeLeft() || 10000))
  // network allowlist: nothing leaves the authorised hosts
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:' || hostAllowed(u.hostname, allowed)) return route.continue()
    report.data.blockedRequests.push({ url: `${u.origin}${u.pathname}`, method: route.request().method() })
    return route.abort('blockedbyclient')
  })
  if (args['freeze-time']) {
    const fixed = new Date(String(args['freeze-time'])).getTime()
    await context.addInitScript((t) => {
      const RealDate = Date
      class FrozenDate extends RealDate {
        constructor(...a) {
          super(...(a.length ? a : [t]))
        }
        static now() {
          return t
        }
      }
      window.Date = FrozenDate
    }, fixed)
  }
  await context.addInitScript(PAGE_HELPERS)

  let visited = 0
  for (const path of paths) {
    if (visited >= maxPages || !timeLeft()) {
      report.notes.push(`budget reached: ${visited} page(s) visited, ${paths.length - visited} skipped`)
      break
    }
    visited++
    const url = new URL(path, target.origin).href
    const pageRecord = { url, title: null, status: null, checks: {}, console: [] }
    report.data.pages.push(pageRecord)
    // text of masked elements (--mask) is removed from every evidence string of this page; the global emit is not used below
    let maskedTexts = []
    const scrubText = (value) => {
      if (typeof value !== 'string' || !maskedTexts.length) return value
      let out = value
      for (const t of maskedTexts) out = out.split(t).join('[masked]')
      return out
    }
    const pageEmit = (f) => emit({ ...f, message: scrubText(f.message), evidence: scrubText(f.evidence) })
    const page = await context.newPage()
    const consoleMessages = []
    page.on('console', (m) => consoleMessages.push({ type: m.type(), text: scrubText(m.text().slice(0, 200)) }))
    page.on('pageerror', (e) => consoleMessages.push({ type: 'pageerror', text: String(e.message).slice(0, 200) }))
    try {
      const response = await page.goto(url, { waitUntil: 'load' })
      pageRecord.status = response?.status() ?? null
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
      maskedTexts = await page.evaluate((selector) => {
        const out = new Set()
        for (const el of document.querySelectorAll(selector)) {
          for (const raw of [el.textContent, el.value, el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('placeholder')]) {
            const trimmed = (raw || '').trim()
            if (trimmed.length < 4) continue
            out.add(trimmed)
            out.add(trimmed.replace(/\s+/g, ' '))
            if (trimmed.length > 60) out.add(trimmed.slice(0, 60))
          }
        }
        return [...out].sort((a, b) => b.length - a.length)
      }, masks.join(',')).catch(() => [])
      pageRecord.title = scrubText(await page.title())
      // login wall: a password field on a different path than requested
      const loginWall = await page.evaluate(() => Boolean(document.querySelector('input[type="password"]')))
      if (loginWall && new URL(page.url()).pathname !== new URL(url).pathname) {
        pageEmit({ id: 'auth-required', level: 'info', severity: 'info', file: path, message: `redirected to a login page (${new URL(page.url()).pathname}); the browser mode never authenticates`, fix: 'audit public pages, or run the audit inside an authorised session you start yourself' })
        pageRecord.checks.authRequired = true
        continue
      }
      if (checks.has('hydration')) await checkHydration(page, url, path, consoleMessages, pageEmit, pageRecord)
      if (checks.has('axe')) await checkAxe(page, tooling.axeSource, path, pageEmit, pageRecord)
      if (checks.has('keyboard')) await checkKeyboard(page, path, pageEmit, pageRecord)
      if (checks.has('dialogs')) await checkDialogs(page, path, Boolean(args.interact), pageEmit, pageRecord)
      if (checks.has('forms')) await checkForms(page, context, url, path, pageEmit, pageRecord)
      if (checks.has('responsive') || checks.has('visual') || args.screenshots) {
        for (const vp of viewports) {
          await page.setViewportSize(VIEWPORTS[vp])
          await page.goto(url, { waitUntil: 'load' })
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
          if (checks.has('responsive')) for (const scale of textScales) await checkResponsive(page, path, vp, scale, pageEmit, pageRecord)
          await page.evaluate(() => { document.documentElement.style.fontSize = '' })
          if (args.screenshots || checks.has('visual')) {
            const shot = await screenshot(page, masks, outDir, path, vp, report)
            if (checks.has('visual')) await compareVisual(shot, path, vp, args, report, pageEmit, outDir)
          }
        }
      }
    } catch (error) {
      pageRecord.error = String(error.message).split('\n')[0].slice(0, 200)
      pageEmit({ id: 'page-check-failed', level: 'info', severity: 'info', file: path, message: `could not complete the checks: ${pageRecord.error}`, fix: 'check the URL, the server and the time budget; the page was not audited' })
    } finally {
      pageRecord.console = consoleMessages.slice(0, 50)
      await page.close()
    }
  }
  await browser.close()

  const byId = {}
  for (const f of report.findings) byId[f.id] = (byId[f.id] ?? 0) + 1
  report.summary = { pages: visited, findings: report.findings.length, confirmed: report.findings.filter((f) => f.level === 'confirmed').length, heuristic: report.findings.filter((f) => f.level === 'heuristic').length, byId, blockedRequests: report.data.blockedRequests.length, screenshots: report.data.screenshots.length, viewports: viewports.join(','), checks: [...checks].join(','), browser: `${report.analysis.browser.name} ${report.analysis.browser.version}`, axe: tooling.axeVersion ?? 'n/a', outDir }
  report.notes.push('Browser evidence: every finding names a page, a viewport when relevant and a selector; text is truncated and masked elements are excluded. Passing axe-core is not WCAG conformance: reading order, meaningful alternatives, timing and cognitive criteria need human review.')
  if (report.data.blockedRequests.length) report.notes.push(`${report.data.blockedRequests.length} request(s) to hosts outside the allowlist were blocked (see data.blockedRequests).`)
  writeFileSync(join(outDir, 'browser-audit.json'), JSON.stringify(report, null, 2))
  report.notes.push(`evidence written to ${outDir}`)
  return finish(report, args, { sections: [{ title: 'Pages', table: { headers: ['page', 'status', 'title', 'checks'], rows: report.data.pages.map((p) => [new URL(p.url).pathname, p.status ?? '-', (p.title ?? '').slice(0, 40), Object.keys(p.checks).join(',')]) } }] })
}

function failNow(message) {
  process.stderr.write(`error: ${message}\n`)
  return 2
}

// ---------------------------------------------------------------- checks
async function checkHydration(page, url, path, consoleMessages, emit, record) {
  const hydrationMessages = consoleMessages.filter((m) => /hydrat|mismatch/i.test(m.text))
  record.checks.hydration = { warnings: hydrationMessages.length }
  for (const m of hydrationMessages.slice(0, 3)) emit({ id: 'hydration-mismatch', level: 'confirmed', severity: 'high', file: path, message: `the framework reported a hydration problem: ${m.text.slice(0, 160)}`, fix: 'render the same markup on the server and the client: no Date.now/Math.random/browser APIs during render, valid HTML nesting, identical data on both sides' })
  // server HTML vs hydrated DOM: text that only exists on one side
  try {
    const raw = await page.context().request.get(url, { timeout: 5000 })
    const html = await raw.text()
    const diff = await page.evaluate((serverHtml) => {
      const norm = (t) => t.replace(/\s+/g, ' ').trim()
      const doc = new DOMParser().parseFromString(serverHtml, 'text/html')
      for (const el of doc.querySelectorAll('script, style, noscript, template')) el.remove()
      const server = norm(doc.body?.textContent ?? '')
      const client = norm(document.body.innerText)
      const words = (t) => new Set(t.split(' ').filter((w) => w.length > 3))
      const s = words(server)
      const c = words(client)
      const onlyServer = [...s].filter((w) => !c.has(w)).slice(0, 8)
      const onlyClient = [...c].filter((w) => !s.has(w)).slice(0, 8)
      return { serverLength: server.length, clientLength: client.length, onlyServer, onlyClient }
    }, html)
    record.checks.hydration = { ...record.checks.hydration, ...diff }
    if (diff.serverLength > 0 && diff.onlyClient.length >= 5 && diff.onlyServer.length === 0) emit({ id: 'client-only-rendered-content', level: 'info', severity: 'low', file: path, message: `${diff.onlyClient.length}+ words exist only after client rendering (sample: ${diff.onlyClient.slice(0, 4).join(', ')}): content not in the server HTML`, fix: 'expected for client-only widgets; for primary content, prefer server rendering or a visible loading state' })
  } catch {
    /* no server HTML available (SPA shells, blocked fetch) */
  }
}

async function checkAxe(page, axeSource, path, emit, record) {
  await page.addScriptTag({ content: axeSource })
  const results = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations', 'incomplete'], rules: { region: { enabled: false } } })
    return {
      violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, tags: v.tags.filter((t) => /^wcag|best-practice/.test(t)), nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(' '), summary: (n.failureSummary || '').split('\n')[0].slice(0, 120) })), count: v.nodes.length })),
      incomplete: r.incomplete.map((v) => ({ id: v.id, count: v.nodes.length })),
    }
  })
  record.checks.axe = { violations: results.violations.length, incomplete: results.incomplete.length }
  for (const v of results.violations) {
    const level = v.impact === 'critical' || v.impact === 'serious' ? 'confirmed' : 'heuristic'
    const severity = v.impact === 'critical' ? 'critical' : v.impact === 'serious' ? 'high' : v.impact === 'moderate' ? 'medium' : 'low'
    emit({ id: `axe-${v.id}`, level, severity, file: path, message: `${v.help} (${v.count} element${v.count === 1 ? '' : 's'}, impact ${v.impact}; ${v.tags.join(', ')})`, evidence: v.nodes.map((n) => n.target).join(' | '), fix: `${v.nodes[0]?.summary ?? ''} ${v.helpUrl}`.trim() })
  }
  if (results.incomplete.length) emit({ id: 'axe-needs-review', level: 'info', severity: 'info', file: path, message: `axe could not decide ${results.incomplete.length} rule(s) automatically: ${results.incomplete.map((i) => `${i.id} (${i.count})`).join(', ')}`, fix: 'review these manually; they are neither passes nor violations' })
}

async function checkKeyboard(page, path, emit, record) {
  const total = await page.evaluate(() => {
    const els = window.__fa.focusables()
    els.forEach((e, i) => e.setAttribute('data-fa-focusable', String(i)))
    return els.length
  })
  const reached = new Set()
  let first = null
  for (let i = 0; i < Math.min(total + 5, 80); i++) {
    await page.keyboard.press('Tab')
    const idx = await page.evaluate(() => document.activeElement?.getAttribute('data-fa-focusable') ?? null)
    if (idx === null) continue
    if (first === null) first = idx
    else if (idx === first && reached.size > 0) break // cycled back to the start
    reached.add(idx)
  }
  const unreachable = await page.evaluate((reachedIdx) => {
    const set = new Set(reachedIdx)
    return [...document.querySelectorAll('[data-fa-focusable]')].filter((e) => !set.has(e.getAttribute('data-fa-focusable'))).slice(0, 10).map((e) => ({ selector: window.__fa.selector(e), name: window.__fa.name(e), tag: e.tagName.toLowerCase() }))
  }, [...reached])
  record.checks.keyboard = { focusable: total, reached: reached.size, unreachable: unreachable.length }
  if (unreachable.length && total <= 80) emit({ id: 'keyboard-unreachable', level: 'heuristic', severity: 'medium', file: path, message: `${unreachable.length} visible focusable element(s) were not reached by Tab in document order (e.g. ${unreachable.slice(0, 3).map((u) => `${u.tag} "${u.name || u.selector}"`).join(', ')})`, evidence: unreachable.map((u) => u.selector).join(' | '), fix: 'check for focus traps, tabindex="-1" on real controls or scripts that move focus; keyboard users must reach every control' })
  // hover-only disclosure: elements revealed by :hover and not reachable otherwise
  const hoverOnly = await page.evaluate(() => {
    const out = []
    for (const sheet of document.styleSheets) {
      let rules
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      for (const r of rules) {
        if (!r.selectorText || !/:hover/.test(r.selectorText) || !/display\s*:\s*(block|flex|grid)/.test(r.cssText) || /:focus/.test(r.selectorText)) continue
        // the rule matters only when the hovered element exists on this page
        const base = r.selectorText.split(':hover')[0].trim()
        let present = false
        try {
          present = Boolean(base && document.querySelector(base))
        } catch {
          present = false
        }
        if (present) out.push(r.selectorText)
      }
    }
    return out.slice(0, 5)
  })
  if (hoverOnly.length) emit({ id: 'hover-only-disclosure', level: 'heuristic', severity: 'medium', file: path, message: `content shown only on :hover (${hoverOnly.join(', ')}): no :focus or :focus-within equivalent in the stylesheet`, fix: 'pair :hover with :focus-within, or use a button with aria-expanded' })
}

async function checkDialogs(page, path, interact, emit, record) {
  // triggers: buttons announcing a dialog; with --interact, any non-destructive type="button"
  const triggers = await page.evaluate(({ interact, destructive }) => {
    const re = new RegExp(destructive, 'i')
    return [...document.querySelectorAll('button, [role="button"]')].filter((b) => window.__fa.visible(b)).map((b, i) => {
      b.setAttribute('data-fa-trigger', String(i))
      return { i, haspopup: b.getAttribute('aria-haspopup') === 'dialog' || b.hasAttribute('data-fa-opens-dialog'), type: b.getAttribute('type'), name: window.__fa.name(b), selector: window.__fa.selector(b) }
    }).filter((t) => t.haspopup || (interact && t.type !== 'submit' && !re.test(t.name)))
  }, { interact, destructive: DESTRUCTIVE_RE.source })
  record.checks.dialogs = { triggers: triggers.length, opened: 0 }
  for (const t of triggers.slice(0, 5)) {
    const before = await page.evaluate(() => ({ dialogs: document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]').length, fixed: [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed' && window.__fa.visible(e)).length }))
    await page.focus(`[data-fa-trigger="${t.i}"]`)
    await page.click(`[data-fa-trigger="${t.i}"]`)
    await page.waitForTimeout(300)
    const after = await page.evaluate(() => {
      const dialogs = [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]')].filter((e) => window.__fa.visible(e))
      const fixed = [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed' && window.__fa.visible(e) && e.getBoundingClientRect().height > 80)
      const active = document.activeElement
      const dialog = dialogs[0] ?? null
      const modalLike = dialog ? null : fixed.find((e) => !e.hasAttribute('aria-hidden') && e.querySelector('button, a, input'))
      return { dialogs: dialogs.length, focusInside: dialog ? dialog.contains(active) : modalLike ? modalLike.contains(active) : null, modalLike: modalLike ? window.__fa.selector(modalLike) : null, dialogSelector: dialog ? window.__fa.selector(dialog) : null, dialogName: dialog ? window.__fa.name(dialog) || (dialog.getAttribute('aria-labelledby') ? 'labelledby' : '') : null, activeSelector: window.__fa.selector(active) }
    })
    const opened = after.dialogs > before.dialogs || after.modalLike
    if (!opened) continue
    record.checks.dialogs.opened++
    const target = after.dialogSelector ?? after.modalLike
    if (after.modalLike) emit({ id: 'custom-modal-without-dialog-role', level: 'heuristic', severity: 'medium', file: path, message: `"${t.name}" opens a fixed overlay (${after.modalLike}) that is not a <dialog> and has no role="dialog"/aria-modal`, evidence: t.selector, fix: 'use <dialog>.showModal() or role="dialog" + aria-modal="true" with focus trapping' })
    if (after.focusInside === false) emit({ id: 'dialog-focus-not-moved', level: 'confirmed', severity: 'high', file: path, message: `after opening ${target} focus stayed on ${after.activeSelector}, outside the dialog`, evidence: t.selector, fix: 'move focus to the dialog (first control or the heading) when it opens' })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    const afterEscape = await page.evaluate(() => ({ dialogs: [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]')].filter((e) => window.__fa.visible(e)).length, active: window.__fa.selector(document.activeElement), fixedVisible: [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed' && window.__fa.visible(e) && e.getBoundingClientRect().height > 80 && e.querySelector('button, a, input')).length }))
    const stillOpen = after.dialogSelector ? afterEscape.dialogs > before.dialogs : afterEscape.fixedVisible > 0
    if (stillOpen) {
      emit({ id: 'dialog-escape-does-not-close', level: 'heuristic', severity: 'medium', file: path, message: `${target} stays open after Escape`, evidence: t.selector, fix: 'close on Escape (native <dialog> does it; custom overlays need a keydown handler)' })
      // close through a cancel/close button inside, if any, so the next trigger starts clean
      await page.evaluate((sel) => {
        const root = document.querySelector(sel) ?? document
        const btn = [...root.querySelectorAll('button')].find((b) => /close|cancel|cerrar|cancelar|dismiss|×/i.test(b.textContent || b.getAttribute('aria-label') || ''))
        btn?.click()
      }, target)
      await page.waitForTimeout(200)
    }
    const focusAfterClose = await page.evaluate((i) => document.activeElement?.getAttribute('data-fa-trigger') === String(i), t.i)
    if (!focusAfterClose) emit({ id: 'dialog-focus-not-restored', level: 'confirmed', severity: 'medium', file: path, message: `after closing ${target} focus did not return to the opener "${t.name}"`, evidence: t.selector, fix: 'restore focus to the element that opened the dialog' })
  }
}

async function checkForms(page, context, url, path, emit, record) {
  const forms = await page.evaluate(() => [...document.querySelectorAll('form')].map((f, i) => {
    f.setAttribute('data-fa-form', String(i))
    const submit = f.querySelector('button[type="submit"], input[type="submit"], button:not([type])')
    return { i, id: f.id || null, selector: window.__fa.selector(f), hasSubmit: Boolean(submit), hasPassword: Boolean(f.querySelector('input[type="password"]')), fields: [...f.querySelectorAll('input:not([type=hidden]):not([type=submit]), select, textarea')].length }
  }))
  record.checks.forms = { forms: forms.length, tested: 0, skippedCredentials: 0 }
  for (const f of forms.slice(0, 5)) {
    if (!f.hasSubmit) continue
    if (f.hasPassword) {
      // a sign-in, sign-up or password-change form: never submitted (no login attempts, no lockouts, no accounts created)
      record.checks.forms.skippedCredentials++
      emit({ id: 'form-skipped-credentials', level: 'info', severity: 'info', file: path, message: `${f.selector}: contains a password field; credential forms are never submitted by the browser mode`, fix: 'test sign-in and password flows in a session you drive yourself; the tool never authenticates' })
      continue
    }
    record.checks.forms.tested++
    const formSel = `form[data-fa-form="${f.i}"]`
    const submitSel = `${formSel} button[type="submit"], ${formSel} input[type="submit"], ${formSel} button:not([type])`
    // 1. empty submission: is the validation feedback perceivable and associated, does focus move?
    await page.goto(url, { waitUntil: 'load' })
    await page.evaluate((i) => document.querySelectorAll('form')[i]?.setAttribute('data-fa-form', String(i)), f.i)
    const requestsBefore = []
    const onRequest = (r) => {
      if (r.method() !== 'GET') requestsBefore.push(r.url())
    }
    page.on('request', onRequest)
    await page.click(submitSel).catch(() => {})
    await page.waitForTimeout(500)
    const feedback = await page.evaluate((sel) => {
      const form = document.querySelector(sel)
      if (!form) return null
      const invalid = [...form.querySelectorAll('[aria-invalid="true"], :invalid')]
      const alerts = [...document.querySelectorAll('[role="alert"], [aria-live], .error, .invalid-feedback, [data-error]')].filter((e) => window.__fa.visible(e) && (e.textContent || '').trim())
      const associated = invalid.some((i) => i.getAttribute('aria-describedby') || i.getAttribute('aria-errormessage'))
      const active = document.activeElement
      const focusOnField = Boolean(active && form.contains(active) && /^(input|select|textarea)$/i.test(active.tagName))
      return { invalid: invalid.length, alerts: alerts.length, alertAssociated: associated || alerts.some((a) => a.id && [...form.querySelectorAll('input, select, textarea')].some((c) => `${c.getAttribute('aria-describedby') || ''} ${c.getAttribute('aria-errormessage') || ''}`.split(/\s+/).includes(a.id))), focusOnField, nativeValidation: form.noValidate === false && invalid.some((i) => typeof i.checkValidity === 'function' && i.validity && !i.validity.valid) }
    }, formSel)
    page.off('request', onRequest)
    if (feedback) {
      if (!feedback.alerts && !feedback.invalid && requestsBefore.length === 0 && f.fields > 0) emit({ id: 'form-no-validation-feedback', level: 'heuristic', severity: 'medium', file: path, message: `${f.selector}: submitting empty produced no visible message, no aria-invalid and no request`, evidence: f.selector, fix: 'validate on submit and show field errors linked with aria-describedby; move focus to the first invalid field' })
      if (feedback.alerts && !feedback.alertAssociated && !feedback.nativeValidation) emit({ id: 'form-error-not-associated', level: 'confirmed', severity: 'medium', file: path, message: `${f.selector}: an error message appeared but no field is marked aria-invalid with aria-describedby pointing at it`, evidence: f.selector, fix: 'set aria-invalid="true" on the field and aria-describedby to the message id' })
      // a field-level error: a field is marked invalid, or an error appeared that no field points to; a form-level
      // message announced by an associated alert ("you must be signed in") does not ask for focus on a field
      const fieldLevelError = feedback.invalid > 0 || (feedback.alerts > 0 && !feedback.alertAssociated)
      if (fieldLevelError && !feedback.focusOnField && !feedback.nativeValidation) emit({ id: 'form-focus-not-moved-to-error', level: 'heuristic', severity: 'low', file: path, message: `${f.selector}: after a failed submit focus did not move to a field`, evidence: f.selector, fix: 'focus the first invalid field (or an error summary) so keyboard and screen-reader users land on the problem' })
    }
    // 2. filled submission: pending state, double submission, confirmation
    await page.goto(url, { waitUntil: 'load' })
    await page.evaluate((i) => document.querySelectorAll('form')[i]?.setAttribute('data-fa-form', String(i)), f.i)
    await page.evaluate((sel) => {
      const form = document.querySelector(sel)
      for (const el of form.querySelectorAll('input, select, textarea')) {
        if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') continue
        if (el.tagName === 'SELECT') {
          const opt = [...el.options].find((o) => o.value)
          if (opt) el.value = opt.value
        } else if (el.type === 'checkbox' || el.type === 'radio') el.checked = true
        else if (el.type === 'email') el.value = 'audit@example.test'
        else if (el.type === 'number') el.value = '1'
        else if (el.type === 'date') el.value = '2026-01-01'
        else if (el.type === 'password') el.value = 'Audit-Pass-1!'
        else el.value = 'Audit value'
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, formSel)
    const posts = []
    const finished = new Map()
    const onPost = (r) => {
      if (r.method() !== 'GET') posts.push({ url: r.url(), at: Date.now(), request: r })
    }
    const onFinished = (r) => {
      if (r.method() !== 'GET') finished.set(r, Date.now())
    }
    page.on('request', onPost)
    page.on('requestfinished', onFinished)
    page.on('requestfailed', onFinished)
    const feedbackSelector = '[role="status"], [aria-live], [role="alert"]'
    const readFeedback = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => (e.textContent || '').trim()).join('|'), feedbackSelector)
    const statusBefore = await readFeedback()
    await page.click(submitSel).catch(() => {})
    // observe the submit control while the first request is in flight (every 10 ms, at most 300 ms); a response
    // faster than the first sample leaves the pending state unobservable, which is recorded, not reported
    let samples = 0
    let lockedWhileInFlight = false
    const clickedAt = Date.now()
    while (Date.now() - clickedAt < 300) {
      const first = posts[0]
      if (first && finished.has(first.request)) break
      if (first) {
        samples++
        const locked = await page.evaluate((sel) => {
          const btn = document.querySelector(sel)
          return btn ? btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.getAttribute('aria-busy') === 'true' || Boolean(btn.closest('form')?.getAttribute('aria-busy')) : null
        }, submitSel)
        if (locked) lockedWhileInFlight = true
      }
      await page.waitForTimeout(10)
    }
    // the second click of a double click: while the first request is still in flight for slow actions, right after
    // it finished for fast ones
    await page.click(submitSel, { force: true }).catch(() => {})
    await page.waitForTimeout(1500)
    page.off('request', onPost)
    page.off('requestfinished', onFinished)
    page.off('requestfailed', onFinished)
    const statusAfter = await readFeedback()
    const navigated = new URL(page.url()).pathname !== new URL(url).pathname
    const firstEnd = posts[0] ? finished.get(posts[0].request) ?? null : null
    const firstMs = posts[0] && firstEnd ? firstEnd - posts[0].at : null
    const concurrent = posts.length >= 2 && (firstEnd === null || posts[1].at < firstEnd)
    record.checks.forms[f.selector] = { posts: posts.length, concurrent, firstResponseMs: firstMs, pending: samples ? (lockedWhileInFlight ? 'locked while in flight' : 'not locked while in flight') : 'not observable (response faster than the first sample)', statusChanged: statusAfter !== statusBefore, navigated }
    if (concurrent) emit({ id: 'form-double-submit', level: 'confirmed', severity: 'high', file: path, message: `${f.selector}: two quick clicks on submit sent ${posts.length} requests, the second before the first response arrived`, evidence: posts.map((p) => new URL(p.url).pathname).join(', '), fix: 'ignore submits while one is pending (disable the button, keep a pending flag, make the endpoint idempotent)' })
    else if (posts.length >= 2) emit({ id: 'form-double-submit', level: 'heuristic', severity: 'medium', file: path, message: `${f.selector}: a double click produced ${posts.length} sequential submissions (the first finished in ${firstMs} ms, before the second click); the form was not kept locked between them`, evidence: posts.map((p) => new URL(p.url).pathname).join(', '), fix: 'make the endpoint idempotent or ignore a second submit right after a completed one; a fast response is not protection on a slow network' })
    if (posts.length >= 1 && samples > 0 && !lockedWhileInFlight) emit({ id: 'form-no-pending-state', level: 'heuristic', severity: 'medium', file: path, message: `${f.selector}: while the request was in flight (${firstMs ?? '>300'} ms) the submit button was neither disabled nor aria-busy`, evidence: f.selector, fix: 'reflect the pending state on the button and the form (aria-busy) so users know the action is running' })
    if (posts.length >= 1 && !navigated && statusAfter === statusBefore) emit({ id: 'form-no-success-feedback', level: 'heuristic', severity: 'medium', file: path, message: `${f.selector}: the request was sent but no status, live or alert region changed and the page did not navigate`, evidence: f.selector, fix: 'confirm the result in a role="status" region (or navigate); an action that seems to do nothing gets repeated' })
  }
}

async function checkResponsive(page, path, viewport, scale, emit, record) {
  await page.evaluate((s) => { document.documentElement.style.fontSize = s === 1 ? '' : `${s * 100}%` }, scale)
  await page.waitForTimeout(100)
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const overflow = document.documentElement.scrollWidth > vw + 1
    const culprits = []
    const scrollers = []
    for (const el of document.querySelectorAll('body *')) {
      if (!window.__fa.visible(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.right > vw + 1 && rect.width > 20) {
        if (window.__fa.insideScroller(el) || el.hasAttribute('data-allow-overflow')) {
          if (el.hasAttribute('data-allow-overflow')) scrollers.push(window.__fa.selector(el))
          continue
        }
        const sel = window.__fa.selector(el)
        if (!culprits.some((c) => sel.startsWith(c.selector))) culprits.push({ selector: sel, tag: el.tagName.toLowerCase(), overflowPx: Math.round(rect.right - vw) })
      }
    }
    const controls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea')].filter((e) => window.__fa.visible(e))
    const cut = controls.filter((e) => e.getBoundingClientRect().right > vw + 1 && !window.__fa.insideScroller(e)).map((e) => window.__fa.selector(e))
    const covered = []
    for (const e of controls) {
      e.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      const rect = e.getBoundingClientRect()
      const cx = Math.min(vw - 1, Math.max(0, rect.left + rect.width / 2))
      const cy = Math.min(vh - 1, Math.max(0, rect.top + rect.height / 2))
      const top = document.elementFromPoint(cx, cy)
      if (top && top !== e && !e.contains(top) && !top.contains(e)) {
        const pos = getComputedStyle(top).position
        if (pos === 'fixed' || pos === 'sticky' || pos === 'absolute') covered.push({ control: window.__fa.selector(e), name: window.__fa.name(e), by: window.__fa.selector(top) })
      }
    }
    window.scrollTo(0, 0)
    const dialogs = [...document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]')].filter((e) => window.__fa.visible(e) && e.getBoundingClientRect().height > vh + 1).map((e) => window.__fa.selector(e))
    const navLinks = [...document.querySelectorAll('nav a[href]')]
    const hiddenNav = navLinks.length && navLinks.every((a) => !window.__fa.visible(a)) && !document.querySelector('nav button[aria-expanded], button[aria-controls]')
    return { vw, overflow, culprits: culprits.slice(0, 8), scrollers, cut: cut.slice(0, 8), covered: covered.slice(0, 8), dialogs, hiddenNav }
  })
  record.checks[`responsive:${viewport}@${scale}`] = { overflow: r.overflow, culprits: r.culprits.length, cut: r.cut.length, covered: r.covered.length, scrollers: r.scrollers.length }
  const where = `${viewport} (${r.vw}px${scale !== 1 ? `, text ${scale * 100}%` : ''})`
  if (r.overflow && r.culprits.length) emit({ id: 'horizontal-overflow', level: 'confirmed', severity: 'medium', file: path, message: `${where}: the page scrolls horizontally; outside any intentional scroller: ${r.culprits.map((c) => `${c.selector} (+${c.overflowPx}px)`).join(', ')}`, evidence: `viewport ${viewport}; scale ${scale}`, fix: 'constrain widths (max-width: 100%, min-width: 0 in flex/grid children), wrap wide tables in a labelled scroll region, or re-flow the layout at this breakpoint' })
  if (r.cut.length) emit({ id: 'control-cut-off', level: 'confirmed', severity: 'medium', file: path, message: `${where}: control(s) extend beyond the viewport: ${r.cut.join(', ')}`, fix: 'keep interactive controls inside the viewport at every breakpoint' })
  for (const c of r.covered.slice(0, 3)) emit({ id: 'control-covered', level: 'confirmed', severity: 'medium', file: path, message: `${where}: "${c.name || c.control}" is covered by ${c.by} when scrolled into view`, evidence: c.control, fix: 'add scroll-padding/scroll-margin for fixed bars, or make the bar part of the flow at this breakpoint' })
  if (r.dialogs.length) emit({ id: 'dialog-exceeds-viewport', level: 'confirmed', severity: 'medium', file: path, message: `${where}: dialog taller than the viewport (${r.dialogs.join(', ')})`, fix: 'max-height with internal scrolling; keep the dialog actions reachable' })
  if (r.hiddenNav) emit({ id: 'navigation-unreachable', level: 'heuristic', severity: 'medium', file: path, message: `${where}: every nav link is hidden and no disclosure button (aria-expanded/aria-controls) was found`, fix: 'expose a menu button that toggles the navigation and announces its state' })
}

async function screenshot(page, masks, outDir, path, viewport, report) {
  const dir = join(outDir, 'screenshots')
  mkdirSync(dir, { recursive: true })
  const name = `${(path.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'root')}@${viewport}`
  const file = join(dir, `${name}.png`)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }' })
  await page.evaluate(() => document.fonts?.ready)
  const maskLocators = masks.map((m) => page.locator(m))
  const buffer = await page.screenshot({ fullPage: true, animations: 'disabled', mask: maskLocators, maskColor: '#808080' })
  writeFileSync(file, buffer)
  report.data.screenshots.push({ page: path, viewport, file })
  return { name, file, buffer, viewport, path }
}

async function compareVisual(shot, path, viewport, args, report, emit, outDir) {
  const baselineDir = report.analysis.baselineDir
  const meta = { browser: report.analysis.browser, playwright: report.analysis.playwright, viewport: VIEWPORTS[viewport], deviceScaleFactor: 1, reducedMotion: 'reduce', fonts: 'document.fonts.ready awaited', animations: 'disabled', generatedAt: new Date().toISOString() }
  const baseFile = join(baselineDir, `${shot.name}.png`)
  const metaFile = join(baselineDir, `${shot.name}.json`)
  const accepted = existsSync(join(baselineDir, 'accepted.json')) ? JSON.parse(readFileSync(join(baselineDir, 'accepted.json'), 'utf8')) : {}
  const approve = new Set(String(args.approve ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const record = { name: shot.name, page: path, viewport, baseline: existsSync(baseFile) ? baseFile : null, status: null }
  report.data.visual.push(record)
  if (!existsSync(baseFile) || approve.has(shot.name)) {
    if (args['write-baseline'] || approve.has(shot.name)) {
      mkdirSync(baselineDir, { recursive: true })
      writeFileSync(baseFile, shot.buffer)
      writeFileSync(metaFile, JSON.stringify(meta, null, 2))
      record.status = approve.has(shot.name) ? 'baseline-approved' : 'baseline-written'
      emit({ id: 'visual-baseline-written', level: 'info', severity: 'info', file: path, message: `${shot.name}: baseline ${approve.has(shot.name) ? 'replaced on request' : 'created'} (${basename(baseFile)})`, fix: 'review and commit the baseline deliberately' })
    } else {
      const candidates = join(outDir, 'candidates')
      mkdirSync(candidates, { recursive: true })
      writeFileSync(join(candidates, `${shot.name}.png`), shot.buffer)
      record.status = 'baseline-missing'
      emit({ id: 'visual-baseline-missing', level: 'info', severity: 'info', file: path, message: `${shot.name}: no approved baseline; candidate saved under ${candidates}`, fix: 'review the candidate and run again with --write-baseline to approve it' })
    }
    return
  }
  const baseMeta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null
  const incompatible = []
  if (baseMeta) {
    if ((baseMeta.browser?.name ?? '') !== meta.browser.name) incompatible.push(`browser ${baseMeta.browser?.name} vs ${meta.browser.name}`)
    if ((baseMeta.browser?.version ?? '').split('.')[0] !== meta.browser.version.split('.')[0]) incompatible.push(`browser version ${baseMeta.browser?.version} vs ${meta.browser.version}`)
    if ((baseMeta.browser?.platform ?? '') !== meta.browser.platform) incompatible.push(`platform ${baseMeta.browser?.platform} vs ${meta.browser.platform}`)
    if (baseMeta.viewport?.width !== meta.viewport.width || baseMeta.viewport?.height !== meta.viewport.height) incompatible.push('viewport')
  } else incompatible.push('no baseline metadata')
  if (incompatible.length) {
    record.status = 'environment-mismatch'
    emit({ id: 'visual-environment-mismatch', level: 'info', severity: 'low', file: path, message: `${shot.name}: baseline environment differs (${incompatible.join('; ')}); no regression verdict`, fix: 'compare in the environment that produced the baseline, or re-approve the baseline there' })
    return
  }
  let diff
  try {
    diff = diffImages(decodePng(readFileSync(baseFile)), decodePng(shot.buffer), { threshold: 32 })
  } catch (error) {
    record.status = 'compare-failed'
    emit({ id: 'visual-compare-failed', level: 'info', severity: 'low', file: path, message: `${shot.name}: ${error.message}`, fix: 'baselines must be 8-bit RGB/RGBA PNGs produced by this tool' })
    return
  }
  record.diff = { ratio: diff.ratio, differing: diff.differing, total: diff.total, regions: diff.regions, sizeChanged: diff.sizeChanged }
  const threshold = Number(args['visual-threshold'] ?? 0.001)
  if (diff.sizeChanged) {
    record.status = 'size-changed'
    emit({ id: 'visual-regression', level: 'confirmed', severity: 'medium', file: path, message: `${shot.name}: screenshot size changed (${diff.baseSize} → ${diff.size})`, evidence: `viewport ${viewport}`, fix: 'layout height changed; review the page at this viewport' })
    return
  }
  if (diff.ratio > threshold) {
    if (accepted[shot.name]) {
      record.status = 'difference-accepted'
      emit({ id: 'visual-difference-accepted', level: 'info', severity: 'info', file: path, message: `${shot.name}: ${(diff.ratio * 100).toFixed(2)}% of pixels differ; accepted (${accepted[shot.name].reason ?? 'no reason recorded'})`, fix: 'approve a new baseline when the change is final' })
    } else {
      record.status = 'regression'
      writeFileSync(join(outDir, `${shot.name}.diff.json`), JSON.stringify(record.diff, null, 2))
      emit({ id: 'visual-regression', level: 'confirmed', severity: 'medium', file: path, message: `${shot.name}: ${(diff.ratio * 100).toFixed(2)}% of pixels differ from the approved baseline (${diff.regions.length} region(s), largest ${diff.regions[0] ? `${diff.regions[0].w}×${diff.regions[0].h} at ${diff.regions[0].x},${diff.regions[0].y}` : 'n/a'})`, evidence: `viewport ${viewport}; threshold ${threshold}`, fix: 'review the regions; approve with --approve <name> only when the change is intended' })
    }
  } else record.status = 'match'
}

if (isMainModule(import.meta.url)) run(process.argv.slice(2)).then((code) => { process.exitCode = code }, (error) => { process.stderr.write(`error: ${error?.stack ?? error}\n`); process.exitCode = 2 })
