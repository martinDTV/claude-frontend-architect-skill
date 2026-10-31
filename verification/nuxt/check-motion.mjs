#!/usr/bin/env node
// Motion engineering browser check (1.5, increment 2) for the Nuxt verification app: the documented ScrollStory page
// (references/motion-engineering.md) served from the production build (.output) with the mock backend the index page
// needs. Same assertions as the Next check, through the shared runner in verification/browser/motion-checks.mjs.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const browserDir = join(here, '..', 'browser')
if (!existsSync(join(browserDir, 'node_modules', 'playwright'))) {
  const msg = 'check-motion (nuxt): playwright not installed in verification/browser (npm ci && npx playwright install chromium)'
  if (process.env.FA_REQUIRE_BROWSER === '1') {
    console.error(msg)
    process.exit(1)
  }
  console.log(`${msg}; skipped`)
  process.exit(0)
}
if (!existsSync(join(here, '.output', 'server', 'index.mjs'))) {
  console.error('check-motion (nuxt): no .output build; run `npx nuxt build` first')
  process.exit(1)
}
const freePort = () => new Promise((resolve) => { const srv = createServer(); srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) }) })
const mockPort = await freePort()
const appPort = await freePort()
const mock = spawn('python3', [join(here, '..', 'ssr-test', 'mock-backend.py')], { env: { ...process.env, MOCK_PORT: String(mockPort) }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
const app = spawn(process.execPath, [join(here, '.output', 'server', 'index.mjs')], { cwd: here, env: { ...process.env, PORT: String(appPort), HOST: '127.0.0.1', NUXT_API_BASE_SERVER: `http://127.0.0.1:${mockPort}/api/v1` }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
let log = ''
for (const p of [mock, app]) {
  p.stdout.on('data', (d) => (log += d))
  p.stderr.on('data', (d) => (log += d))
}
const stop = () => { for (const p of [mock, app]) { try { process.kill(-p.pid, 'SIGTERM') } catch { /* gone */ } } }
process.on('exit', stop)
const url = `http://127.0.0.1:${appPort}`
let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  try {
    const res = await fetch(`${url}/motion`)
    ready = res.ok
  } catch { /* not yet */ }
  if (!ready) await new Promise((r) => setTimeout(r, 500))
}
if (!ready) {
  console.error(`check-motion (nuxt): the app did not answer on ${url}/motion within 30 s\n${log.slice(0, 800)}`)
  stop()
  process.exit(1)
}
// the shared runner lives in verification/browser next to the pinned Playwright and runs as a child process, so this
// project's import graph (audited by the reference checks) stays inside the project
const check = spawnSync(process.execPath, [join(browserDir, 'motion-checks.mjs'), '--url', url, '--story', '/motion', '--other', '/motion-second', '--other-link', 'Go to the second page', '--back-link', 'Back to the story', '--server-marker', 'The story loads in the browser.', '--label', 'nuxt'], { stdio: 'inherit' })
stop()
const code = check.status ?? 1
process.exit(code)
