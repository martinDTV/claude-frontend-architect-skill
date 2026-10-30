// Browser-mode check of the Next.js reference project: the documented RenameUserForm (references/nextjs.md),
// served by `next start` from the build run-all.sh just made, must pass the forms check of browser-audit with
// submissions enabled. Uses the Playwright and axe-core pinned in verification/browser; when they are missing
// the check is skipped with a message, or fails when FA_REQUIRE_BROWSER=1 (CI).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const browserDir = join(here, '..', 'browser')
const scripts = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts')
const required = process.env.FA_REQUIRE_BROWSER === '1'

if (!existsSync(join(browserDir, 'node_modules', 'playwright'))) {
  const msg = 'check-browser: playwright not installed in verification/browser (npm ci && npx playwright install chromium)'
  if (required) {
    console.error(`${msg}; FA_REQUIRE_BROWSER=1`)
    process.exit(1)
  }
  console.log(`${msg}; skipped`)
  process.exit(0)
}
if (!existsSync(join(here, '.next', 'BUILD_ID'))) {
  console.error('check-browser: no production build in verification/next/.next (run `next build` first)')
  process.exit(1)
}

const freePort = () => new Promise((resolve, reject) => {
  const srv = createServer()
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address()
    srv.close(() => resolve(port))
  })
  srv.on('error', reject)
})
const port = await freePort()
const nextBin = join(here, 'node_modules', '.bin', 'next')
const server = spawn(nextBin, ['start', '-p', String(port), '-H', '127.0.0.1'], { cwd: here, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))
const stop = () => {
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
}
process.on('exit', stop)

const url = `http://127.0.0.1:${port}`
let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  try {
    const res = await fetch(`${url}/users`)
    ready = res.status === 200
  } catch {
    /* not yet */
  }
  if (!ready) await new Promise((r) => setTimeout(r, 500))
}
if (!ready) {
  console.error(`check-browser: next start did not answer on ${url} within 30 s\n${serverLog.slice(0, 800)}`)
  stop()
  process.exit(1)
}

const out = mkdtempSync(join(tmpdir(), 'fa-next-browser-'))
const audit = spawnSync(process.execPath, [join(scripts, 'browser-audit.mjs'), url, '--playwright', browserDir, '--paths', '/users', '--checks', 'axe,forms', '--allow-submit', '--out', out, '--json', '--fail-on', 'none'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
stop()
if (audit.status !== 0) {
  console.error(`check-browser: browser-audit exit ${audit.status}\n${audit.stderr.slice(0, 800)}`)
  process.exit(1)
}
const report = JSON.parse(audit.stdout)
const ids = report.findings.map((f) => `${f.id}/${f.level}`)
const failures = []
const expect = (cond, msg) => (cond ? null : failures.push(msg))
const form = Object.values(report.data.pages[0]?.checks?.forms ?? {}).find((v) => v && typeof v === 'object' && 'posts' in v)
expect(report.data.pages.length === 1 && report.data.pages[0].status === 200, 'the users page must be served')
expect(form && form.posts >= 1, `the form must have been submitted (got ${JSON.stringify(form)})`)
expect(!ids.includes('form-double-submit/confirmed'), 'no concurrent double submission: the form is locked while pending')
expect(!ids.includes('form-no-pending-state/heuristic'), 'the submit button is disabled while the request is in flight')
expect(form && form.pending !== 'not locked while in flight', `pending state: ${form?.pending}`)
expect(!ids.includes('form-error-not-associated/confirmed'), 'the error text is associated with the field')
expect(!ids.includes('form-no-success-feedback/heuristic'), 'the server answer is reflected in an alert or status region')
expect(!ids.includes('form-skipped-credentials/info'), 'the rename form has no password field and must be tested')
expect(!ids.some((i) => i.startsWith('axe-') && i.endsWith('/confirmed')), 'no serious or critical axe violation on the reference form')
console.log(`check-browser: /users forms ${JSON.stringify(form)}; findings: ${ids.join(', ') || 'none'}`)
if (failures.length) {
  console.error(`check-browser FAILED:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('check-browser: the documented RenameUserForm passes the forms check (pending lock, associated errors, feedback)')
