#!/usr/bin/env node
/**
 * Design system checks (1.5 increment 5, block B): the design contract as the apps apply it. Opens /design, reads the
 * colour roles back from the computed styles and compares them with the contract's resolved roles in the light and the
 * dark theme (the toggle, then a reload: the choice persists), checks the pairs table the page computes, the focus ring
 * on the first control, the reduced-motion policy, the legibility of every text (lib/legibility.mjs), zero console
 * errors; then runs the plugin's own browser-audit (axe, keyboard, responsive at mobile, desktop and 320 px with text at
 * 100% and 200%) against the same page and requires zero confirmed findings.
 *
 *   node design-checks.mjs --url http://127.0.0.1:3000 --label next --contract ../design/contracts/atlas-logistics.json
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gradeLegibility, measureFocus, measureLegibility } from './lab-checks.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts')
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }

const readRoles = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-roles] [data-role]')].map((li) => [li.getAttribute('data-role'), li.querySelector('[data-hex]')?.textContent?.trim()])))
const readPairs = (page) => page.evaluate(() => [...document.querySelectorAll('[data-pairs] tbody tr')].map((tr) => ({ pair: tr.getAttribute('data-pair'), pass: tr.getAttribute('data-pass') === 'true', text: tr.textContent.replace(/\s+/g, ' ').trim() })))
const themeName = (page) => page.evaluate(() => document.querySelector('[data-theme-name]')?.textContent?.trim())
const isDark = (page) => page.evaluate(() => document.documentElement.classList.contains('dark'))

export async function runDesignChecks(chromium, { url, label, contractPath, evidence, playwrightDir }) {
  mkdirSync(evidence, { recursive: true })
  const { buildRamps, validateContract } = await import(join(scripts, 'design-contract.mjs'))
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
  const expected = validateContract(contract, contractPath).data.roles
  const ramps = buildRamps(contract)
  const browser = await chromium.launch({ headless: true })
  const results = []
  const report = { label, contract: contract.name, light: null, dark: null, pairs: null, focus: null, reducedMotion: null, legibility: null, audit: null }
  const ok = (line) => results.push(line)
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
    const page = await context.newPage()
    const problems = []
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text().slice(0, 200)}`) })
    page.on('pageerror', (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`))
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`) })
    await page.goto(`${url}/design`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelectorAll('[data-roles] [data-hex]').length > 0 && [...document.querySelectorAll('[data-roles] [data-hex]')].every((e) => /^#/.test(e.textContent)), null, { timeout: 60000 })
    // 1. light: every role the page applies equals the contract's resolved role
    expect(!(await isDark(page)), 'the page starts in the light theme (system preference light)')
    const light = await readRoles(page)
    const mismatchesLight = Object.entries(expected.light).filter(([role, hex]) => light[role] !== hex)
    expect(mismatchesLight.length === 0, `light roles differ from the contract: ${mismatchesLight.map(([r, h]) => `${r} ${light[r]} vs ${h}`).join(', ')}`)
    report.light = light
    // every ramp step exists on the root at runtime: the theme is static, because Nuxt UI's generated aliases, shadcn's
    // aliases and this page read the ramps through var() and Tailwind v4 would otherwise drop the steps no class uses
    const rampVars = Object.entries(ramps).flatMap(([name, steps]) => Object.keys(steps).map((s) => `--color-${name}-${s}`))
    const missingRamp = await page.evaluate((vars) => { const cs = getComputedStyle(document.documentElement); return vars.filter((v) => !cs.getPropertyValue(v).trim()) }, rampVars)
    expect(missingRamp.length === 0, `ramp variables missing on the root at runtime (${missingRamp.length} of ${rampVars.length}): ${missingRamp.slice(0, 6).join(', ')}`)
    if (label === 'nuxt') {
      // Nuxt UI's semantic colours resolve to the contract's ramps: error to danger, neutral to the contract's tinted neutral (not Tailwind's grey)
      const ui = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { error: cs.getPropertyValue('--ui-color-error-500').trim().toLowerCase(), neutral: cs.getPropertyValue('--ui-color-neutral-500').trim().toLowerCase(), primary: cs.getPropertyValue('--ui-color-primary-500').trim().toLowerCase() } })
      expect(ui.error === ramps.danger['500'].toLowerCase() && ui.neutral === ramps.neutral['500'].toLowerCase() && ui.primary === ramps.accent['500'].toLowerCase(), `Nuxt UI's error, neutral and primary aliases resolve to the contract's ramps (${JSON.stringify(ui)} vs ${ramps.danger['500']}, ${ramps.neutral['500']}, ${ramps.accent['500']})`)
    }
    const pairsLight = await readPairs(page)
    expect(pairsLight.length >= 8 && pairsLight.every((p) => p.pass), `every pair the page computes passes in light (${pairsLight.filter((p) => !p.pass).map((p) => p.text).join(' | ')})`)
    await page.screenshot({ path: join(evidence, `${label}-design-light.png`), fullPage: true })
    ok(`${label}: light theme applies the contract's ${Object.keys(light).length} roles exactly; all ${rampVars.length} ramp steps resolve at runtime${label === 'nuxt' ? "; Nuxt UI's aliases resolve to the contract's ramps" : ''}; ${pairsLight.length} pairs pass`)
    // 2. dark: the toggle switches the class and the roles; the choice survives a reload
    await page.click('[data-theme-toggle]')
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'), null, { timeout: 5000 })
    await page.waitForTimeout(300)
    const dark = await readRoles(page)
    const mismatchesDark = Object.entries(expected.dark).filter(([role, hex]) => dark[role] !== hex)
    expect(mismatchesDark.length === 0, `dark roles differ from the contract: ${mismatchesDark.map(([r, h]) => `${r} ${dark[r]} vs ${h}`).join(', ')}`)
    report.dark = dark
    const pairsDark = await readPairs(page)
    expect(pairsDark.every((p) => p.pass), `every pair passes in dark (${pairsDark.filter((p) => !p.pass).map((p) => p.text).join(' | ')})`)
    const name = await themeName(page)
    expect(/dark/.test(name ?? ''), `the page names the active theme (${name})`)
    await page.screenshot({ path: join(evidence, `${label}-design-dark.png`), fullPage: true })
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelectorAll('[data-roles] [data-hex]').length > 0, null, { timeout: 60000 })
    expect(await isDark(page), 'the dark choice persists across a reload (storage or cookie, applied before paint)')
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    report.pairs = { light: pairsLight, dark: pairsDark }
    ok(`${label}: dark theme applies the contract's roles exactly, persists across reload (body ${bodyBg}); ${pairsDark.length} pairs pass`)
    // 3. focus ring and reduced motion
    const focus = await measureFocus(page, 30)
    const bad = focus.filter((f) => !f.passes)
    expect(focus.length >= 3 && bad.length === 0, `focus indicators on the page's controls (${focus.length} visited, failing: ${bad.map((f) => `${f.tag} ${f.indicator}`).join(', ')})`)
    report.focus = focus
    await page.click('[data-theme-toggle]') // back to light for the legibility pass below
    await page.waitForTimeout(300)
    const legibility = gradeLegibility(await measureLegibility(page, 'design'), `${label} design page`)
    report.legibility = legibility
    ok(`${label}: ${focus.length} focus indicators graded (${focus.filter((f) => f.indicator === 'user-agent').length} user-agent, ${focus.filter((f) => f.indicator !== 'user-agent').length} author); legibility ${legibility.texts} texts, ${legibility.by.css} css / ${legibility.by.bound} bound, worst ${legibility.worst?.ratio}:1`)
    const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
    const rp = await reduced.newPage()
    await rp.goto(`${url}/design`, { waitUntil: 'load' })
    await rp.waitForSelector('[data-motion] .motion-bar')
    const durations = await rp.evaluate(() => [...document.querySelectorAll('[data-motion] .motion-bar')].map((e) => getComputedStyle(e).animationDuration))
    expect(durations.length > 0 && durations.every((d) => parseFloat(d) <= 0.001), `reduced motion cuts the page's animations (${durations.join(', ')})`)
    report.reducedMotion = durations
    await reduced.close()
    ok(`${label}: reduced motion cuts every animation (${durations.length} checked)`)
    expect(problems.length === 0, `console problems: ${problems.join(' | ')}`)
    await context.close()
    // 4. the plugin's browser audit on the same page
    const out = mkdtempSync(join(tmpdir(), 'fa-design-audit-'))
    const audit = spawnSync(process.execPath, [join(scripts, 'browser-audit.mjs'), url, '--playwright', playwrightDir, '--paths', '/design', '--checks', 'axe,keyboard,responsive', '--viewports', 'mobile,desktop,reflow', '--text-scale', '1,2', '--max-time', '240', '--out', out, '--json', '--fail-on', 'none'], { encoding: 'utf8', timeout: 400000 })
    let auditReport = null
    try { auditReport = JSON.parse(audit.stdout) } catch { throw new Error(`browser-audit did not return JSON: ${audit.stderr.slice(0, 400)} ${audit.stdout.slice(0, 200)}`) }
    const confirmed = auditReport.findings.filter((f) => f.level === 'confirmed')
    const pageRecord = auditReport.data?.pages?.[0]
    expect(confirmed.length === 0, `browser-audit confirmed findings on /design: ${confirmed.map((f) => `${f.id} ${f.selector ?? ''} ${(f.message ?? '').slice(0, 80)}`).join(' | ')}`)
    report.audit = { findings: auditReport.findings.map((f) => ({ id: f.id, level: f.level, viewport: f.viewport ?? null })), coverage: pageRecord?.checks?.axe?.coverage ?? null, rulesRun: pageRecord?.checks?.axe?.rulesRun ?? null }
    const heur = auditReport.findings.filter((f) => f.level === 'heuristic')
    ok(`${label}: browser-audit on /design: 0 confirmed, ${heur.length} heuristic (${[...new Set(heur.map((f) => f.id))].join(', ') || 'none'}); axe coverage ${JSON.stringify(report.audit.coverage)}`)
  } finally {
    await browser.close()
    writeFileSync(join(evidence, `${label}-design.json`), JSON.stringify(report, null, 2))
  }
  console.log(`check-design (${label}): ${results.length} checks passed\n  - ${results.join('\n  - ')}`)
  return report
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
  const url = opt('url')
  const label = opt('label') ?? 'app'
  const contractPath = opt('contract') ?? join(here, '..', 'design', 'contracts', 'atlas-logistics.json')
  const evidence = opt('evidence') ?? join(here, 'evidence')
  if (!url) { console.error('design-checks: missing --url'); process.exit(2) }
  const { chromium } = createRequire(import.meta.url)('playwright')
  try {
    await runDesignChecks(chromium, { url, label, contractPath, evidence, playwrightDir: here })
  } catch (error) {
    console.error(`check-design (${label}): ${error.message}`)
    process.exit(1)
  }
}
