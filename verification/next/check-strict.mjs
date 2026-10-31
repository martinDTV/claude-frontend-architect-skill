#!/usr/bin/env node
// 1.5 increment 4B: React Strict Mode in a real browser. `next dev` runs React in development, where Strict Mode mounts,
// unmounts and mounts every effect again; the production build of check-lab.mjs never does. This script starts the dev
// server on a free port, waits for the lab route to compile, and runs verification/browser/strict-checks.mjs against it.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const browserDir = join(here, '..', 'browser')
if (!existsSync(join(browserDir, 'node_modules', 'playwright'))) {
  const msg = 'check-strict (next): playwright not installed in verification/browser (npm ci && npx playwright install chromium)'
  if (process.env.FA_REQUIRE_BROWSER === '1') { console.error(msg); process.exit(1) }
  console.log(`${msg}; skipped`)
  process.exit(0)
}
const freePort = () => new Promise((resolve) => { const srv = createServer(); srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) }) })
const port = await freePort()
const nextBin = join(here, 'node_modules', '.bin', 'next')
// a dev server writes to .next/dev (Next 16) and does not touch the production build check-lab.mjs serves
const server = spawn(nextBin, ['dev', '-p', String(port), '-H', '127.0.0.1'], { cwd: here, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
let serverLog = ''
server.stdout.on('data', (d) => { serverLog += d })
server.stderr.on('data', (d) => { serverLog += d })
const stop = () => { try { process.kill(-server.pid, 'SIGTERM') } catch {} }
process.on('exit', stop)
const url = `http://127.0.0.1:${port}`
// the first request compiles the route: minutes on a slow machine, not seconds
const deadline = Date.now() + 300000
let up = false
while (Date.now() < deadline) {
  try {
    const r = await fetch(`${url}/lab/atelier-r3f`)
    if (r.ok) { up = true; break }
  } catch {}
  await new Promise((r) => setTimeout(r, 1000))
}
if (!up) {
  console.error(`check-strict (next): next dev did not serve ${url}/lab/atelier-r3f within 300 s\n${serverLog.slice(-800)}`)
  stop()
  process.exit(1)
}
const pagesArg = process.argv.indexOf('--pages') >= 0 ? process.argv[process.argv.indexOf('--pages') + 1] : undefined
const check = spawnSync(process.execPath, [join(browserDir, 'strict-checks.mjs'), '--url', url, '--label', 'next', '--evidence', join(browserDir, 'evidence'), ...(pagesArg ? ['--pages', pagesArg] : [])], { stdio: 'inherit' })
stop()
if (check.status !== 0) {
  console.error(`check-strict (next): failed (dev server log tail)\n${serverLog.slice(-1200)}`)
  process.exit(check.status ?? 1)
}
