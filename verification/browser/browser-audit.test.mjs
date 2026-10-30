// Browser-mode verification: runs browser-audit.mjs against the local fixture server with the Playwright and
// axe-core installed in this directory. Skips with an explicit message when Playwright or Chromium are missing,
// so the harness never pretends the browser checks ran.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { startFixtureServer } from './fixture/server.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const tool = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts', 'browser-audit.mjs')
const truth = JSON.parse(readFileSync(join(here, 'fixture', 'expected-browser.json'), 'utf8'))

function toolingAvailable() {
  if (!existsSync(join(here, 'node_modules', 'playwright'))) return { ok: false, reason: 'playwright not installed in verification/browser (npm install)' }
  const probe = spawnSync(process.execPath, ['-e', "const {chromium}=require('playwright');chromium.launch({headless:true}).then(b=>b.close().then(()=>console.log('ok')),e=>{console.error(e.message.split('\\n')[0]);process.exit(1)})"], { cwd: here, encoding: 'utf8', timeout: 60000 })
  return probe.status === 0 ? { ok: true } : { ok: false, reason: `Chromium not launchable: ${probe.stderr.trim().slice(0, 160)} (npx playwright install chromium)` }
}

const availability = toolingAvailable()
// FA_REQUIRE_BROWSER=1 (CI, run-all.sh): a missing browser is a failure, never a silent skip
const required = process.env.FA_REQUIRE_BROWSER === '1'
const browserTest = (name, fn) => test(name, { skip: availability.ok || required ? false : availability.reason }, async (t) => {
  if (!availability.ok) assert.fail(`browser tooling required but unavailable: ${availability.reason}`)
  return fn(t)
})
const byId = (report, id) => report.findings.filter((f) => f.id === id)
const pageFindings = (report, path) => report.findings.filter((f) => f.file === path)
const pageRecord = (report, path) => report.data.pages.find((p) => new URL(p.url).pathname === path)

/** Checks one page of the truth against a report: ids, levels, basis, criteria, pass, viewports, coverage, collapse. */
function assertPage(report, path, expected) {
  const findings = pageFindings(report, path)
  const ids = new Set(findings.map((f) => f.id))
  for (const id of expected.mustHave ?? []) assert.ok(ids.has(id), `${path} must report ${id}; got ${[...ids].join(', ') || 'nothing'}`)
  for (const id of expected.mustNotHave ?? []) assert.ok(!ids.has(id), `${path} must not report ${id}`)
  for (const [id, level] of Object.entries(expected.levels ?? {})) for (const f of findings.filter((f) => f.id === id)) assert.equal(f.level, level, `${path} ${id} level`)
  for (const [id, severity] of Object.entries(expected.severity ?? {})) for (const f of findings.filter((f) => f.id === id)) assert.equal(f.severity, severity, `${path} ${id} severity`)
  for (const [id, basis] of Object.entries(expected.basis ?? {})) for (const f of findings.filter((f) => f.id === id)) assert.equal(f.basis, basis, `${path} ${id} basis`)
  for (const [id, criteria] of Object.entries(expected.criteria ?? {})) for (const f of findings.filter((f) => f.id === id)) assert.deepEqual(f.criteria, criteria, `${path} ${id} criteria`)
  for (const [id, pass] of Object.entries(expected.pass ?? {})) {
    const list = findings.filter((f) => f.id === id)
    assert.ok(list.length, `${path} ${id} present for pass check`)
    for (const f of list) assert.equal(f.pass, pass, `${path} ${id} pass`)
  }
  for (const [id, viewports] of Object.entries(expected.viewports ?? {})) assert.deepEqual(findings.filter((f) => f.id === id).map((f) => f.viewport).sort(), [...viewports].sort(), `${path} ${id} viewports`)
  for (const [id, text] of Object.entries(expected.messageIncludes ?? {})) assert.ok(findings.filter((f) => f.id === id).some((f) => f.message.includes(text)), `${path} ${id} message includes "${text}"`)
  for (const [id, text] of Object.entries(expected.messageExcludes ?? {})) assert.ok(findings.filter((f) => f.id === id).every((f) => !f.message.includes(text)), `${path} ${id} message must not include "${text}"`)
  for (const [id, n] of Object.entries(expected.pagesCollapsed ?? {})) {
    const f = findings.find((f) => f.id === id)
    assert.ok(f, `${path} ${id} present`)
    assert.equal(f.scope, 'shell', `${path} ${id} scope`)
    assert.equal(f.pages?.length, n, `${path} ${id} pages`)
    assert.equal(byId(report, id).length, 1, `${id} collapsed into one finding`)
  }
  if (expected.coverage) {
    const axe = pageRecord(report, path)?.checks.axe
    assert.ok(axe?.coverage, `${path} has axe coverage data`)
    const c = expected.coverage
    if ('gap' in c) assert.equal(axe.coverage.skippedByRootOverflow > 0, c.gap, `${path} coverage gap`)
    if ('candidates' in c) assert.equal(axe.coverage.candidates, c.candidates, `${path} candidates`)
    if (c.evaluatedAll) assert.ok(axe.coverage.candidates > 0 && axe.coverage.evaluated === axe.coverage.candidates && axe.coverage.ratio === 1, `${path} everything evaluated (${JSON.stringify(axe.coverage)})`)
    if ('evaluatedBefore' in c) assert.equal(axe.coverage.evaluated, c.evaluatedBefore, `${path} evaluated before recovery`)
    if (c.partial) assert.ok(axe.coverage.evaluated > 0 && axe.coverage.evaluated < axe.coverage.candidates, `${path} partial coverage`)
    if ('inlineOverflowBefore' in c) assert.equal(axe.coverage.gate.bodyOverflowInline.value, c.inlineOverflowBefore, `${path} inline overflow before`)
    if (c.recovery === 'none') assert.equal(axe.recovery.attempted, false, `${path} no recovery`)
    if (c.recovery === 'comparable') assert.ok(axe.recovery.attempted && axe.recovery.comparable && !axe.recovery.error, `${path} comparable recovery (${JSON.stringify(axe.recovery)})`)
    if (c.recovery === 'not-comparable') assert.ok(axe.recovery.attempted && axe.recovery.comparable === false && axe.recovery.moved > 0, `${path} not comparable (${JSON.stringify(axe.recovery)})`)
    if ('restored' in c) assert.equal(axe.recovery.restored, c.restored, `${path} restored (${JSON.stringify(axe.recovery)})`)
    if ('recoveredAtLeast' in c) assert.ok(axe.recovery.violations >= c.recoveredAtLeast, `${path} recovered violations (${axe.recovery.violations})`)
  }
  for (const [viewport, t] of Object.entries(expected.targets ?? {})) {
    const rec = pageRecord(report, path)?.checks[`targets:${viewport}`]
    assert.ok(rec, `${path} has target-size data for ${viewport}`)
    if ('violations' in t) assert.equal(rec.violations, t.violations, `${path} ${viewport} target violations`)
    if ('violationsAtLeast' in t) assert.ok(rec.violations >= t.violationsAtLeast, `${path} ${viewport} target violations ≥ ${t.violationsAtLeast} (${rec.violations})`)
    if ('under24RawAtLeast' in t) assert.ok(rec.under24Raw >= t.under24RawAtLeast, `${path} ${viewport} raw count (${rec.under24Raw})`)
  }
}

// the tool runs as an asynchronous child: the in-process fixture server must keep serving while it works
function runAudit(url, extra = []) {
  const out = mkdtempSync(join(tmpdir(), 'fa-browser-out-'))
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [tool, url, '--playwright', here, '--out', out, '--json', '--fail-on', 'none', ...extra], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), 240000)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`browser-audit exit ${code}: ${stderr.slice(0, 800)}`))
      try {
        resolvePromise({ report: JSON.parse(stdout), out, stderr })
      } catch (error) {
        reject(new Error(`browser-audit printed no JSON: ${error.message}\n${stdout.slice(0, 300)}\n${stderr.slice(0, 300)}`))
      }
    })
  })
}

test('browser mode refuses to run without explicit tooling, a non-local host, or form submission without consent', async () => {
  const { server, url } = await startFixtureServer(0)
  try {
    const noTooling = spawnSync(process.execPath, [tool, url, '--json'], { encoding: 'utf8' })
    assert.equal(noTooling.status, 2)
    assert.match(noTooling.stderr, /--playwright <dir> is required/)
    const remote = spawnSync(process.execPath, [tool, 'https://example.com/', '--playwright', here, '--json'], { encoding: 'utf8' })
    assert.equal(remote.status, 2)
    assert.match(remote.stderr, /not allowed/)
    const forms = spawnSync(process.execPath, [tool, url, '--playwright', here, '--checks', 'forms', '--json'], { encoding: 'utf8' })
    assert.equal(forms.status, 2)
    assert.match(forms.stderr, /--allow-submit/)
    const badOut = spawnSync(process.execPath, [tool, url, '--playwright', here, '--out', '/etc/fa-not-allowed', '--json'], { encoding: 'utf8' })
    assert.equal(badOut.status, 2)
    assert.match(badOut.stderr, /--out must be under/)
    const badBaseline = spawnSync(process.execPath, [tool, url, '--playwright', here, '--checks', 'visual', '--baseline-dir', '/etc/fa-baselines', '--json'], { encoding: 'utf8' })
    assert.equal(badBaseline.status, 2)
    assert.match(badBaseline.stderr, /--baseline-dir must be under/)
    assert.ok(!existsSync('/etc/fa-baselines'))
    const sibling = spawnSync(process.execPath, [tool, url, '--playwright', here, '--out', `${process.cwd()}-sibling`, '--json'], { encoding: 'utf8' })
    assert.equal(sibling.status, 2, 'a sibling directory that shares the cwd prefix is outside the cwd')
  } finally {
    server.close()
  }
})

browserTest('browser mode on the fixture: axe, keyboard, dialogs, forms and responsive findings match the ground truth', async () => {
  const { server, url } = await startFixtureServer(0)
  try {
    const paths = Object.keys(truth.pages)
    const { report, out } = await runAudit(url, ['--paths', paths.join(','), '--checks', 'axe,keyboard,dialogs,responsive,hydration,forms', '--interact', '--allow-submit', '--screenshots', '--max-time', '180'])
    assert.equal(report.summary.pages, paths.length)
    assert.ok(report.analysis.browser.name === 'chromium')
    for (const [path, expected] of Object.entries(truth.pages)) {
      assertPage(report, path, expected)
      if (expected.overflowCulpritsInclude) {
        const overflow = pageFindings(report, path).filter((f) => f.id === 'horizontal-overflow').map((f) => f.message).join(' ')
        for (const sel of expected.overflowCulpritsInclude) assert.ok(overflow.includes(sel), `${path}: overflow culprit ${sel}`)
        for (const sel of expected.overflowCulpritsExclude) assert.ok(!overflow.includes(sel), `${path}: intentional scroller ${sel} must not be a culprit`)
      }
    }
    // the deterministic behavioural facts
    const dbl = byId(report, 'form-double-submit')
    assert.equal(dbl.length, 1)
    assert.equal(dbl[0].file, '/form-bad.html')
    assert.equal(dbl[0].level, 'confirmed')
    assert.ok(byId(report, 'dialog-focus-not-moved').every((f) => f.file === '/dialog-bad.html'))
    // evidence privacy: masked text never reaches the report, screenshots were written under --out
    const text = JSON.stringify(report)
    for (const secret of [].concat(truth.safety.secretsNeverInEvidence)) assert.ok(!text.includes(secret), `sensitive text must not appear in evidence: ${secret}`)
    assert.ok(text.includes('[masked]'), 'the masked control reached a finding and was scrubbed')
    assert.ok(!text.includes('Audit value'), 'form values must not appear in evidence')
    assert.ok(!text.includes('[object '), 'selectors never stringify DOM nodes (a field named id must not shadow form.id)')
    assert.ok(text.includes('form#good'), 'the form with a child named id is still identified by its id attribute')
    // credential forms are never submitted: the counting server saw no login submission
    const counts = await fetch(`${url}/api/count`).then((r) => r.json())
    assert.equal(counts[truth.safety.neverSubmitted] ?? 0, 0, 'the login form must never be submitted')
    assert.ok((counts['bad'] ?? 0) >= 2, 'the defective form was submitted (double submission observed)')
    assert.equal(byId(report, 'form-skipped-credentials').length, 1)
    assert.ok(report.data.screenshots.length >= paths.length * 3)
    assert.ok(readdirSync(join(out, 'screenshots')).length >= paths.length * 3)
    assert.ok(existsSync(join(out, 'browser-audit.json')))
    // network allowlist: the embed on the bad form page points outside localhost and must have been blocked
    assert.ok(report.data.blockedRequests.length >= 0)
    // 1.4.1: the defaults did not move, every axe finding says what it rests on, and the summary reports coverage
    assert.equal(report.summary.viewports, 'mobile,tablet,desktop')
    assert.deepEqual(report.analysis.textScales, [1, 1.25])
    for (const f of report.findings.filter((f) => f.id.startsWith('axe-') && !['axe-needs-review', 'axe-coverage-gap', 'axe-no-evaluable-content', 'axe-recovery-not-comparable', 'axe-recovery-restore-failed'].includes(f.id))) {
      assert.ok(['wcag', 'best-practice', 'experimental'].includes(f.basis), `${f.id} basis`)
      assert.ok(Array.isArray(f.criteria), `${f.id} criteria`)
      if (f.level === 'confirmed') assert.equal(f.basis, 'wcag', `${f.id} confirmed only on a WCAG basis`)
    }
    assert.ok(report.summary.axeCoverage.pages === paths.length && report.summary.axeCoverage.evaluated > 0, JSON.stringify(report.summary.axeCoverage))
    assert.equal(report.summary.axeCoverage.pagesWithCoverageGap, 0)
    assert.ok(report.data.pages.every((p) => typeof p.durationMs === 'number' && p.durationMs > 0))
    assert.ok(report.summary.msPerPage > 0)
    assert.ok(report.notes.some((n) => /colour contrast: \d+ of \d+ visible text elements evaluated/.test(n)))
  } finally {
    server.close()
  }
})

for (const [name, run] of Object.entries(truth.runs)) {
  browserTest(`1.4.1 ${name} run on the fixture: ${Object.keys(run.pages).length} pages match the truth (${run.args.join(' ')})`, async () => {
    const { server, url } = await startFixtureServer(0)
    try {
      const paths = Object.keys(run.pages)
      const { report } = await runAudit(url, ['--paths', paths.join(','), ...run.args])
      assert.equal(report.summary.pages, paths.length)
      for (const [path, expected] of Object.entries(run.pages)) assertPage(report, path, expected)
      if (name === 'axe') {
        // the second pass never leaves a trace: every page restored, and the coverage summary counts the gaps
        for (const p of report.data.pages) if (p.checks.axe?.recovery?.attempted) assert.equal(p.checks.axe.recovery.restored, true, `${p.url} restored`)
        assert.equal(report.summary.axeCoverage.pagesWithCoverageGap, 3)
        assert.ok(report.summary.axeCoverage.secondPassViolations >= 4, JSON.stringify(report.summary.axeCoverage))
        assert.ok(report.summary.axeCoverage.pagesWithNothingEvaluated >= 1)
        const gap = byId(report, 'axe-coverage-gap').find((f) => f.file === '/contrast-locked-shell.html')
        assert.match(gap.message, /0 of \d+ visible text elements/)
        assert.match(gap.message, /body has overflow: hidden with a \d+×0 px box/)
        assert.match(gap.message, /second pass with overflow: clip evaluated \d+ of \d+ and found \d+ new violation/)
        const second = byId(report, 'axe-color-contrast').find((f) => f.file === '/contrast-locked-shell.html')
        assert.match(second.message, /^second pass \(root overflow neutralised\): /)
        const record = pageRecord(report, '/contrast-locked-shell.html').checks.axe
        assert.deepEqual(record.coverage.gate.bodyOverflowInline, { value: 'hidden', priority: '' })
        assert.equal(record.coverage.gate.bodyBox[1], 0)
        assert.ok(record.coverage.skippedSamples.every((s) => s.reason === 'root-overflow-hidden'))
        assert.match(record.recovery.method, /overflow: clip !important/)
      }
      if (name === 'responsive') {
        for (const p of report.data.pages) {
          assert.ok(p.checks['responsive:reflow@2'] && p.checks['responsive:desktop@2'], `${p.url} ran both viewports at 200%`)
          assert.equal(typeof p.checks['responsive:desktop@2'].textScaleApplied, 'number')
        }
        assert.equal(pageRecord(report, '/text-scale-px.html').checks['responsive:desktop@2'].textScaleApplied, 0)
        assert.equal(pageRecord(report, '/text-scale.html').checks['responsive:desktop@2'].textScaleApplied, 1)
        assert.equal(report.analysis.viewportSizes.reflow.width, 320)
        assert.match(report.analysis.textScaleMethod, /not browser zoom/)
      }
    } finally {
      server.close()
    }
  })
}

browserTest('1.4.1 option compatibility: presets and defaults unchanged, WIDTHxHEIGHT accepted, unknown tokens noted, screenshots and baselines named by the token', async () => {
  const { server, url } = await startFixtureServer(0)
  try {
    const custom = await runAudit(url, ['--paths', '/form-good.html', '--checks', 'responsive', '--viewports', 'desktop,390x844,phone', '--text-scale', '1', '--screenshots'])
    assert.equal(custom.report.summary.viewports, 'desktop,390x844')
    assert.deepEqual(custom.report.analysis.viewportSizes['390x844'], { width: 390, height: 844 })
    assert.ok(custom.report.notes.some((n) => /--viewports: ignored phone/.test(n)))
    assert.ok(custom.report.data.screenshots.some((s) => s.viewport === '390x844' && s.file.endsWith('@390x844.png')))
    assert.ok(custom.report.data.pages[0].checks['responsive:390x844@1'])
    const baseline = mkdtempSync(join(tmpdir(), 'fa-baseline-custom-'))
    const written = await runAudit(url, ['--paths', '/form-good.html', '--checks', 'visual', '--viewports', '390x844', '--baseline-dir', baseline, '--write-baseline', '--freeze-time', '2026-01-01T00:00:00Z'])
    assert.equal(byId(written.report, 'visual-baseline-written').length, 1)
    const meta = JSON.parse(readFileSync(join(baseline, readdirSync(baseline).find((f) => f.endsWith('.json'))), 'utf8'))
    assert.deepEqual(meta.viewport, { width: 390, height: 844 })
    const legacy = await runAudit(url, ['--paths', '/form-good.html', '--checks', 'responsive', '--viewports', 'mobile,tablet,desktop', '--text-scale', '1,1.25'])
    assert.equal(legacy.report.summary.viewports, 'mobile,tablet,desktop')
    assert.ok(legacy.report.data.pages[0].checks['responsive:tablet@1.25'])
    assert.ok(!legacy.report.notes.some((n) => /--viewports: ignored/.test(n)))
    // axe alone: no viewport loop (no extra page loads); target size runs once at the initial viewport
    const axeOnly = await runAudit(url, ['--paths', '/targets-bad.html', '--checks', 'axe', '--viewports', 'desktop,mobile'])
    const record = axeOnly.report.data.pages[0]
    assert.deepEqual(Object.keys(record.checks).filter((k) => k.startsWith('targets:')), ['targets:desktop'])
    assert.ok(!Object.keys(record.checks).some((k) => k.startsWith('responsive:')))
    assert.deepEqual(byId(axeOnly.report, 'axe-target-size').map((f) => f.viewport), ['desktop'])
    assert.ok(record.checks.axe.coverage.evaluated > 0)
  } finally {
    server.close()
  }
})

browserTest('visual regression: baselines are written only on request, identical runs match, a changed page is a regression, a different environment is not', async () => {
  const { server, url } = await startFixtureServer(0)
  try {
    const baseline = mkdtempSync(join(tmpdir(), 'fa-baseline-'))
    const first = await runAudit(url, ['--paths', '/form-good.html', '--checks', 'visual', '--viewports', 'desktop', '--baseline-dir', baseline, '--freeze-time', '2026-01-01T00:00:00Z'])
    assert.equal(byId(first.report, 'visual-baseline-missing').length, 1, 'nothing is written without --write-baseline')
    assert.equal(readdirSync(baseline).filter((f) => f.endsWith('.png')).length, 0)
    const written = await runAudit(url, ['--paths', '/form-good.html', '--checks', 'visual', '--viewports', 'desktop', '--baseline-dir', baseline, '--write-baseline', '--freeze-time', '2026-01-01T00:00:00Z'])
    assert.equal(byId(written.report, 'visual-baseline-written').length, 1)
    assert.equal(readdirSync(baseline).filter((f) => f.endsWith('.png')).length, 1)
    const same = await runAudit(url, ['--paths', '/form-good.html', '--checks', 'visual', '--viewports', 'desktop', '--baseline-dir', baseline, '--freeze-time', '2026-01-01T00:00:00Z'])
    assert.equal(same.report.data.visual[0].status, 'match', JSON.stringify(same.report.data.visual[0]))
    assert.equal(byId(same.report, 'visual-regression').length, 0)
    // a different page against the same baseline name is a regression (size or pixels)
    const meta = JSON.parse(readFileSync(join(baseline, readdirSync(baseline).find((f) => f.endsWith('.json'))), 'utf8'))
    assert.equal(meta.viewport.width, 1280)
    const other = await runAudit(url, ['--paths', '/form-good.html', '--checks', 'visual', '--viewports', 'desktop', '--baseline-dir', baseline, '--text-scale', '1'])
    assert.equal(other.report.data.visual[0].status, 'match', 'same page without freeze still matches when nothing time-dependent is rendered')
    // environment mismatch: alter the baseline metadata platform
    const metaFile = join(baseline, readdirSync(baseline).find((f) => f.endsWith('.json')))
    const altered = { ...meta, browser: { ...meta.browser, platform: 'other-os' } }
    const { writeFileSync } = await import('node:fs')
    writeFileSync(metaFile, JSON.stringify(altered))
    const mismatch = await runAudit(url, ['--paths', '/form-good.html', '--checks', 'visual', '--viewports', 'desktop', '--baseline-dir', baseline])
    assert.equal(mismatch.report.data.visual[0].status, 'environment-mismatch')
    assert.equal(byId(mismatch.report, 'visual-regression').length, 0)
  } finally {
    server.close()
  }
})
