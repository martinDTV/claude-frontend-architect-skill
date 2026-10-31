#!/usr/bin/env node
// Motion engineering browser check (1.5, increment 2): the documented ScrollStory (references/motion-engineering.md),
// served by `next start` from the build run-all.sh just made, must mount, clean up on route change, not duplicate on
// re-entry, honour prefers-reduced-motion, hydrate without errors, stay keyboard-reachable and survive a narrow
// viewport. Every assertion reads DOM or GSAP state through the diagnostics the component exposes; no screenshot.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const browserDir = join(here, '..', 'browser')
if (!existsSync(join(browserDir, 'node_modules', 'playwright'))) {
  const msg = 'check-lab (next): playwright not installed in verification/browser (npm ci && npx playwright install chromium)'
  if (process.env.FA_REQUIRE_BROWSER === '1') {
    console.error(msg)
    process.exit(1)
  }
  console.log(`${msg}; skipped`)
  process.exit(0)
}
if (!existsSync(join(here, '.next', 'BUILD_ID'))) {
  console.error('check-lab (next): no .next build; run `npx next build` first')
  process.exit(1)
}
const freePort = () => new Promise((resolve) => { const srv = createServer(); srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) }) })
const port = await freePort()
const nextBin = join(here, 'node_modules', '.bin', 'next')
const server = spawn(nextBin, ['start', '-p', String(port), '-H', '127.0.0.1'], { cwd: here, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))
const stop = () => { try { process.kill(-server.pid, 'SIGTERM') } catch { /* already gone */ } }
process.on('exit', stop)
const url = `http://127.0.0.1:${port}`
let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  try {
    const res = await fetch(`${url}/lab/shaders`)
    ready = res.ok
  } catch { /* not yet */ }
  if (!ready) await new Promise((r) => setTimeout(r, 500))
}
if (!ready) {
  console.error(`check-lab (next): next start did not answer on ${url}/lab/shaders within 30 s\n${serverLog.slice(0, 800)}`)
  stop()
  process.exit(1)
}
// the shared runner lives in verification/browser next to the pinned Playwright and runs as a child process, so this
// project's import graph (audited by the reference checks) stays inside the project
const pagesArg = process.argv.indexOf('--pages') >= 0 ? process.argv[process.argv.indexOf('--pages') + 1] : null
const check = spawnSync(process.execPath, [join(browserDir, 'lab-checks.mjs'), '--url', url, '--label', 'next', '--evidence', join(browserDir, 'evidence'), ...(pagesArg ? ['--pages', pagesArg] : [])], { stdio: 'inherit' })
stop()
const code = check.status ?? 1
process.exit(code)
