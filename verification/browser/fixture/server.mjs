// Local static server for the browser-mode fixture. Binds to 127.0.0.1 only, serves this directory and a few
// JSON endpoints that let the audit observe real behaviour (delays, double submissions). No external access.
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }
const submissions = new Map() // form id -> count

export function startFixtureServer(port = 0) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/api/submit' && req.method === 'POST') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const form = url.searchParams.get('form') ?? 'unknown'
        submissions.set(form, (submissions.get(form) ?? 0) + 1)
        const delay = Number(url.searchParams.get('delay') ?? 300)
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, form, count: submissions.get(form), received: body.length }))
        }, delay)
      })
      return
    }
    if (url.pathname === '/api/count') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(Object.fromEntries(submissions)))
      return
    }
    if (url.pathname === '/api/reset' && req.method === 'POST') {
      submissions.clear()
      res.writeHead(204)
      res.end()
      return
    }
    const rel = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^(\.\.[/\\])+/, '')
    const file = join(here, rel)
    if (!file.startsWith(here) || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(readFileSync(file))
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}` })))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startFixtureServer(Number(process.argv[2] ?? 0)).then(({ url }) => console.log(url))
}
