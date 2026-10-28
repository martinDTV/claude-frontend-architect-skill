#!/usr/bin/env node
// Measures an existing production build (never builds) and compares it with budgets: entry
// JS/CSS, largest chunks, totals, in raw and gzip bytes. Nuxt (.output/public/_nuxt), Next.js
// (.next/static) and Vite (dist/assets) layouts are recognized. Read-only.
//
// Usage: bundle-budget.mjs <project-root> [--dir path] [--budgets file] [--top 15] [--json|--md]
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { firstExisting, readJson, toPosix, walk } from './lib/fs.mjs'
import { detectProject, loadConfig } from './lib/project.mjs'
import { addFinding, createReport, fail, finish, parseArgs, usage } from './lib/report.mjs'

const HELP = `
bundle-budget — size of the built assets against budgets (gzip, exact; no build is triggered).

usage: node bundle-budget.mjs <project-root> [options]
  --dir <path>        build output directory (auto: .output/public/_nuxt, .next/static, dist/assets)
  --html <file>       a saved rendered page (curl the deployed URL) used to identify the startup assets
  --budgets <file>    JSON with budgets in KB (gzip): { "entryJsKb": 250, "entryCssKb": 60, "maxChunkKb": 300, "totalJsKb": 2000 }
                      (also read from "budgets" in .frontend-audit.json)
  --top <n>           largest files to list (default 15)
  --json | --md       output format
  --fail-on <level>   exit 1 on: confirmed (default; a budget breach is confirmed) | any | none

Startup assets, in order of preference: --html, a rendered index.html/200.html in the output, the
Nuxt client manifest (.output/server/chunks/build/client.manifest.mjs or client.precomputed.mjs),
Next.js build-manifest.json; otherwise file-name conventions (Nuxt 4 hash-only names give nothing and
entry metrics are reported as unknown).
`

const DEFAULT_BUDGETS = { entryJsKb: 250, entryCssKb: 60, maxChunkKb: 300, totalJsKb: null }
const VENDOR_HINTS = ['apexcharts', 'echarts', 'three', 'gsap', 'lodash', 'moment', 'dayjs', 'luxon', 'zod', 'axios', 'chart', 'd3', 'pdf', 'xlsx', 'exceljs', 'monaco', 'codemirror', 'tiptap', 'prosemirror', 'mapbox', 'leaflet', 'firebase', 'sentry']

function detectOutput(root) {
  const candidates = [
    { dir: join(root, '.output', 'public', '_nuxt'), kind: 'nuxt' },
    { dir: join(root, 'dist', '_nuxt'), kind: 'nuxt' },
    { dir: join(root, '.next', 'static'), kind: 'next' },
    { dir: join(root, 'dist', 'assets'), kind: 'vite' },
  ]
  return candidates.find((c) => existsSync(c.dir)) ?? null
}

/**
 * Startup assets from the framework's own manifest: Nuxt client.manifest.mjs (isEntry + transitive
 * static imports + css), Next.js build-manifest.json rootMainFiles + app-build-manifest root layout/page.
 * Returns a Set of asset paths relative to the output dir, or null when no manifest is readable.
 */
function htmlEntries(htmlFile, root) {
  const html = readFileSync(htmlFile, 'utf8')
  const out = new Set()
  for (const m of html.matchAll(/<script[^>]+src="([^"]+\.m?js)(?:\?[^"]*)?"/g)) out.add(m[1])
  for (const m of html.matchAll(/<link[^>]+rel="(?:modulepreload|stylesheet)"[^>]+href="([^"]+)"/g)) out.add(m[1])
  for (const m of html.matchAll(/<link[^>]+href="([^"]+)"[^>]+rel="(?:modulepreload|stylesheet)"/g)) out.add(m[1])
  const names = new Set([...out].map((u) => u.split('?')[0].split('/').pop()))
  return names.size ? { names, source: `${toPosix(relative(root, htmlFile))} (script, modulepreload and stylesheet tags)` } : null
}

/** Nuxt 4 node-server builds ship `client.precomputed.mjs`: per module, the scripts/styles it needs at startup. */
function precomputedEntries(file) {
  const text = readFileSync(file, 'utf8')
  const varFile = new Map()
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)=\{[^{}]*?\bfile:"([^"]+)"/g)) varFile.set(m[1], m[2])
  const entryKey = /"([^"]*\/nuxt\/dist\/app\/entry(?:\.async)?\.js)":\{scripts:\{/.exec(text)
  if (!entryKey) return null
  const names = new Set()
  let i = entryKey.index + entryKey[0].length - 1
  for (const block of ['scripts', 'styles']) {
    const start = block === 'scripts' ? i : text.indexOf('styles:{', i)
    if (start < 0) break
    let depth = 0
    let end = start
    for (let k = start + (block === 'scripts' ? 0 : 'styles:'.length); k < text.length; k++) {
      if (text[k] === '{') depth++
      else if (text[k] === '}') {
        depth--
        if (depth === 0) {
          end = k
          break
        }
      }
    }
    const body = text.slice(start, end + 1)
    for (const m of body.matchAll(/"[^"]+":([A-Za-z_$][\w$]*)(=\{[^{}]*\})?/g)) {
      const inline = m[2] && /\bfile:"([^"]+)"/.exec(m[2])?.[1]
      const f = inline ?? varFile.get(m[1])
      if (f) names.add(f)
    }
    i = end
  }
  return names.size ? { names, source: 'client.precomputed.mjs (startup scripts and styles of the entry)' } : null
}

function manifestEntries(root, kind, outputDir, htmlOverride) {
  if (htmlOverride) {
    const file = resolve(root, htmlOverride)
    if (!existsSync(file)) throw new Error(`--html file not found: ${htmlOverride}`)
    return htmlEntries(file, root)
  }
  // 1. A rendered HTML document lists exactly what the browser loads at startup.
  const htmlFile = firstExisting(
    join(outputDir, '..', 'index.html'), join(outputDir, '..', '200.html'), join(outputDir, '..', '..', 'index.html'),
    join(root, 'out', 'index.html'), join(root, 'dist', 'index.html'),
  )
  if (htmlFile) {
    const found = htmlEntries(htmlFile, root)
    if (found) return found
  }
  // 2. Production client manifests (SSR builds). Minified JS objects, not JSON: parse tolerantly.
  if (kind === 'nuxt') {
    const precomputed = firstExisting(join(root, '.output', 'server', 'chunks', 'build', 'client.precomputed.mjs'))
    if (precomputed) {
      const found = precomputedEntries(precomputed)
      if (found) return found
    }
    const file = firstExisting(join(root, '.output', 'server', 'chunks', 'build', 'client.manifest.mjs'))
    if (file) {
      const text = readFileSync(file, 'utf8')
      if (!text.includes('@vite/client')) {
        const entries = new Map()
        const objStart = text.indexOf('{')
        let depth = 0
        let keyStart = -1
        let key = null
        let valueStart = -1
        for (let i = objStart; i < text.length; i++) {
          const c = text[i]
          if (c === '"' && depth === 1 && keyStart < 0) keyStart = i + 1
          else if (c === '"' && depth === 1 && keyStart >= 0 && key === null) {
            key = text.slice(keyStart, i)
            keyStart = -1
          } else if (c === '{') {
            if (depth === 1 && key !== null) valueStart = i
            depth++
          } else if (c === '}') {
            depth--
            if (depth === 1 && key !== null && valueStart >= 0) {
              const body = text.slice(valueStart, i + 1)
              entries.set(key, {
                file: /\bfile\s*:\s*"([^"]+)"/.exec(body)?.[1],
                isEntry: /\bisEntry\s*:\s*(?:!0|true)/.test(body),
                imports: [...(/\bimports\s*:\s*\[([^\]]*)\]/.exec(body)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]),
                css: [...(/\bcss\s*:\s*\[([^\]]*)\]/.exec(body)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]),
              })
              key = null
              valueStart = -1
            }
            if (depth === 0) break
          }
        }
        const names = new Set()
        const visit = (k) => {
          const e = entries.get(k)
          if (!e || !e.file || names.has(e.file)) return
          names.add(e.file)
          for (const css of e.css) names.add(css)
          for (const dep of e.imports) visit(dep)
        }
        for (const [k, e] of entries) if (e.isEntry) visit(k)
        if (names.size) return { names, source: 'client.manifest.mjs (entry + transitive static imports + css)' }
      }
    }
  }
  if (kind === 'next') {
    const build = readJson(join(root, '.next', 'build-manifest.json'))
    const app = readJson(join(root, '.next', 'app-build-manifest.json'))
    const names = new Set()
    for (const f of build?.rootMainFiles ?? []) names.add(f.replace(/^static\//, ''))
    for (const f of build?.pages?.['/_app'] ?? []) names.add(f.replace(/^static\//, ''))
    for (const page of ['/layout', '/page']) for (const f of app?.pages?.[page] ?? []) names.add(f.replace(/^static\//, ''))
    if (names.size) return { names, source: 'build-manifest.json rootMainFiles + app-build-manifest root layout/page' }
  }
  return null
}

function isEntry(kind, rel) {
  const name = rel.split('/').pop()
  if (kind === 'nuxt') return /^entry[.-]/.test(name)
  if (kind === 'next') return /^(?:main-app|main|webpack|framework|polyfills)[-.]/.test(name) || /^chunks\/app\/(?:layout|page)-/.test(rel) || /^css\//.test(rel)
  if (kind === 'vite') return /^index[.-]/.test(name)
  return false
}

export function run(argv) {
  const args = parseArgs(argv)
  if (args.help || !args._[0]) return usage(HELP)
  const root = resolve(args._[0])
  if (!existsSync(join(root, 'package.json'))) return fail(`no package.json in ${root}`)
  const project = detectProject(root, loadConfig(root, args.config))
  const report = createReport('bundle-budget', project)
  const output = args.dir ? { dir: resolve(root, String(args.dir)), kind: project.framework === 'nuxt' ? 'nuxt' : project.framework === 'next' ? 'next' : 'vite' } : detectOutput(root)
  if (!output || !existsSync(output.dir)) return fail('no production build found (.output/public/_nuxt, .next/static or dist/assets). Run the project’s build first; this tool measures, it does not build.')
  const budgets = { ...DEFAULT_BUDGETS, ...(project.config.budgets ?? {}), ...(args.budgets ? readJson(resolve(root, String(args.budgets))) ?? {} : {}) }
  const top = Number(args.top ?? 15)

  let fromManifest
  try {
    fromManifest = manifestEntries(root, output.kind, output.dir, args.html)
  } catch (e) {
    return fail(e.message)
  }
  const nameBased = !fromManifest
  const assets = []
  for (const file of walk(output.dir, { extensions: ['.js', '.mjs', '.css'] })) {
    if (/\.map$/.test(file)) continue
    const buf = readFileSync(file)
    const rel = toPosix(relative(output.dir, file))
    const entry = fromManifest ? fromManifest.names.has(rel) || fromManifest.names.has(rel.split('/').pop()) : isEntry(output.kind, rel)
    assets.push({ file: rel, type: /\.css$/.test(file) ? 'css' : 'js', raw: buf.length, gzip: gzipSync(buf).length, entry, mtime: statSync(file).mtime.toISOString() })
  }
  report.notes.push(fromManifest ? `startup assets taken from ${fromManifest.source}` : 'startup assets guessed from file names (no HTML or manifest found); prefer running from the project root after a build')
  if (!assets.length) return fail(`no .js/.css assets under ${output.dir}`)
  assets.sort((a, b) => b.gzip - a.gzip)
  const kb = (n) => Math.round((n / 1024) * 10) / 10
  const sum = (list, key) => list.reduce((n, a) => n + a[key], 0)
  const entryJs = assets.filter((a) => a.entry && a.type === 'js')
  const entryCss = assets.filter((a) => a.entry && a.type === 'css')
  const js = assets.filter((a) => a.type === 'js')
  const entryUnknown = nameBased && entryJs.length === 0
  const metrics = {
    entryJsKb: entryUnknown ? null : kb(sum(entryJs, 'gzip')),
    entryCssKb: entryUnknown && entryCss.length === 0 ? null : kb(sum(entryCss, 'gzip')),
    maxChunkKb: kb(Math.max(...js.map((a) => a.gzip))),
    totalJsKb: kb(sum(js, 'gzip')),
  }
  const budgetRows = []
  for (const [key, budget] of Object.entries(budgets)) {
    if (budget == null || metrics[key] === undefined || metrics[key] === null) continue
    const ok = metrics[key] <= budget
    budgetRows.push([key, metrics[key], budget, ok ? 'ok' : 'OVER'])
    if (!ok) {
      const worst = key === 'maxChunkKb' ? js[0]?.file : undefined
      addFinding(report, { id: 'budget-exceeded', level: 'confirmed', severity: key.startsWith('entry') ? 'high' : 'medium', file: worst, message: `${key} = ${metrics[key]} KB gzip, budget ${budget} KB`, fix: key.startsWith('entry') ? 'move non-critical code out of the entry (lazy routes/components, defer third-party scripts), check what the entry imports with the framework analyzer' : 'split the chunk (dynamic import, lazy component) or replace the heavy dependency' })
    }
  }
  for (const a of js.slice(0, top)) if (a.gzip > 200 * 1024 && !a.entry) addFinding(report, { id: 'large-chunk', level: 'info', severity: 'low', file: a.file, message: `${kb(a.gzip)} KB gzip: confirm it is lazy-loaded only where needed` })
  const vendorHits = {}
  for (const a of js) {
    const name = a.file.split('/').pop().toLowerCase()
    if (/^[\w-]{6,12}\.m?js$/.test(name)) continue // hash-only names carry no information
    for (const v of VENDOR_HINTS) if (new RegExp(`(?:^|[-_./])${v}(?:[-_.]|$)`).test(name)) (vendorHits[v] ??= []).push(a.file)
  }
  for (const [v, list] of Object.entries(vendorHits)) if (list.length >= 2) addFinding(report, { id: 'possible-duplicate-vendor', level: 'heuristic', severity: 'low', message: `"${v}" appears in ${list.length} chunk names: ${list.slice(0, 3).join(', ')}`, fix: 'confirm with nuxi analyze / @next/bundle-analyzer whether the library is bundled twice' })

  if (entryUnknown) report.notes.push('startup assets could not be identified (hash-only file names, no HTML or manifest): entry metrics are unknown; pass --html <saved page> or run from a build that keeps client.precomputed.mjs')
  report.summary = { output: toPosix(relative(root, output.dir)), kind: output.kind, files: assets.length, entryJsGzipKb: metrics.entryJsKb ?? 'unknown', entryCssGzipKb: metrics.entryCssKb ?? 'unknown', totalJsGzipKb: metrics.totalJsKb, totalJsRawKb: kb(sum(js, 'raw')), largest: js[0] ? `${js[0].file} (${kb(js[0].gzip)} KB gzip)` : '-', newestAsset: assets.map((a) => a.mtime).sort().pop() }
  report.data = { metrics, budgets, assets }
  const sections = [
    { title: 'Budgets (KB gzip)', table: { headers: ['metric', 'value', 'budget', 'status'], rows: budgetRows } },
    { title: `Largest assets (top ${top})`, table: { headers: ['gzip KB', 'raw KB', 'entry', 'file'], rows: assets.slice(0, top).map((a) => [kb(a.gzip), kb(a.raw), a.entry ? 'yes' : '', a.file]) } },
  ]
  report.notes.push('gzip level 6 (Node zlib default) approximates CDN compression; Brotli is usually 10-20% smaller.')
  return finish(report, args, { sections })
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(run(process.argv.slice(2)))
