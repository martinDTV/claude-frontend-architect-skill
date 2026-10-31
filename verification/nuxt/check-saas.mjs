#!/usr/bin/env node
// 1.5 increment 5, block C: the enterprise reference application in a real browser. Serves the production build
// like check-lab.mjs and runs verification/browser/saas-checks.mjs (states, table, actions, form, preferences,
// keyboard, responsive, reduced motion, then the plugin's browser-audit on four routes).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const browserDir = join(here, '..', 'browser')
if (!existsSync(join(browserDir, 'node_modules', 'playwright'))) {
  const msg = 'check-saas (nuxt): playwright not installed in verification/browser (npm ci && npx playwright install chromium)'
  if (process.env.FA_REQUIRE_BROWSER === '1') {
    console.error(msg)
    process.exit(1)
  }
  console.log(`${msg}; skipped`)
  process.exit(0)
}
if (!existsSync(join(here, '.output', 'server', 'index.mjs'))) {
  console.error('check-saas (nuxt): no .output build; run `npx nuxt build` first')
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
    const res = await fetch(`${url}/lab/shaders`)
    ready = res.ok
  } catch { /* not yet */ }
  if (!ready) await new Promise((r) => setTimeout(r, 500))
}
if (!ready) {
  console.error(`check-saas (nuxt): the app did not answer on ${url}/lab/shaders within 30 s\n${log.slice(0, 800)}`)
  stop()
  process.exit(1)
}
// the shared runner lives in verification/browser next to the pinned Playwright and runs as a child process, so this
// project's import graph (audited by the reference checks) stays inside the project
const check = spawnSync(process.execPath, [join(browserDir, 'saas-checks.mjs'), '--url', url, '--label', 'nuxt', '--evidence', join(browserDir, 'evidence')], { stdio: 'inherit' })
stop()
const code = check.status ?? 1
process.exit(code)
