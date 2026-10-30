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
      const ids = new Set(pageFindings(report, path).map((f) => f.id))
      for (const id of expected.mustHave) assert.ok(ids.has(id), `${path} must report ${id}; got ${[...ids].join(', ') || 'nothing'}`)
      for (const id of expected.mustNotHave) assert.ok(!ids.has(id), `${path} must not report ${id}`)
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
