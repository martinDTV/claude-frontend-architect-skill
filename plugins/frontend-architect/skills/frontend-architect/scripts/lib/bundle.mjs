// Shared build-artifact reading for bundle-budget.mjs and route-attribution.mjs (1.6 increment 4).
// Extracted verbatim from bundle-budget.mjs so both tools read manifests the same way; no behaviour change.
// Recognizes Nuxt (.output/public/_nuxt), Next.js (.next/static) and Vite (dist/assets) layouts. Read-only.
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { firstExisting, readJson, toPosix, walk } from './fs.mjs'

export const DEFAULT_BUDGETS = { entryJsKb: 250, entryCssKb: 60, maxChunkKb: 300, totalJsKb: null }
export const VENDOR_HINTS = ['apexcharts', 'echarts', 'three', 'gsap', 'lodash', 'moment', 'dayjs', 'luxon', 'zod', 'axios', 'chart', 'd3', 'pdf', 'xlsx', 'exceljs', 'monaco', 'codemirror', 'tiptap', 'prosemirror', 'mapbox', 'leaflet', 'firebase', 'sentry']

export function detectOutput(root) {
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
export function htmlEntries(htmlFile, root) {
  const html = readFileSync(htmlFile, 'utf8')
  const out = new Set()
  for (const m of html.matchAll(/<script[^>]+src="([^"]+\.m?js)(?:\?[^"]*)?"/g)) out.add(m[1])
  for (const m of html.matchAll(/<link[^>]+rel="(?:modulepreload|stylesheet)"[^>]+href="([^"]+)"/g)) out.add(m[1])
  for (const m of html.matchAll(/<link[^>]+href="([^"]+)"[^>]+rel="(?:modulepreload|stylesheet)"/g)) out.add(m[1])
  const names = new Set([...out].map((u) => u.split('?')[0].split('/').pop()))
  return names.size ? { names, source: `${toPosix(relative(root, htmlFile))} (script, modulepreload and stylesheet tags)` } : null
}

/** Nuxt 4 node-server builds ship `client.precomputed.mjs`: per module, the scripts/styles it needs at startup. */
export function precomputedEntries(file) {
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

export function manifestEntries(root, kind, outputDir, htmlOverride) {
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
        const entries = parseNuxtManifest(text)
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

/**
 * Inventory of the current build: every asset file name a framework manifest references. Returns
 * { names: Set, source, buildId, otherBuilds, importers: Map<file, Set<importer>> | null } or null
 * when no manifest exists (then nothing can be called stale).
 */
export function buildInventory(root, kind, outputDir) {
  // paths relative to the output directory; Nuxt outputs are flat, so there a bare file name is enough
  const names = new Set()
  const outName = outputDir.split(/[\\/]/).pop()
  const addToken = (t) => {
    if (!t) return
    const clean = t.replace(/^\.?\//, '').replace(new RegExp(`^(?:\\.output/public/)?${outName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), '')
    names.add(clean)
    if (clean.startsWith('_')) names.add(clean.slice(1))
  }
  const addAllTokens = (text) => {
    for (const m of text.matchAll(/["']([^"'\s]+?\.(?:m?js|css))["']/g)) addToken(m[1])
  }
  let source = null
  let buildId = null
  const otherBuilds = []
  let importers = null
  let complete = true // Nuxt and Vite manifests list every chunk; Next.js only in webpack builds
  if (kind === 'nuxt') {
    const manifestFile = firstExisting(join(root, '.output', 'server', 'chunks', 'build', 'client.manifest.mjs'), join(root, '.output', 'server', 'chunks', 'build', 'client.precomputed.mjs'))
    if (manifestFile) {
      const text = readFileSync(manifestFile, 'utf8')
      addAllTokens(text)
      source = toPosix(relative(root, manifestFile))
      if (manifestFile.endsWith('client.manifest.mjs')) {
        importers = new Map()
        for (const [, entry] of parseNuxtManifest(text)) {
          for (const dep of entry.imports) {
            const depFile = dep.replace(/^_/, '')
            if (!importers.has(depFile)) importers.set(depFile, new Set())
            if (entry.file) importers.get(depFile).add(entry.file)
          }
        }
      }
    }
    const latest = readJson(join(outputDir, 'builds', 'latest.json'))
    if (latest?.id) buildId = latest.id
    const metaDir = join(outputDir, 'builds', 'meta')
    if (existsSync(metaDir)) {
      for (const f of walk(metaDir, { extensions: ['.json'] })) {
        const meta = readJson(f)
        if (meta?.id && meta.id !== buildId) otherBuilds.push({ id: meta.id, timestamp: meta.timestamp ? new Date(meta.timestamp).toISOString() : null })
      }
    }
  } else if (kind === 'next') {
    const files = ['build-manifest.json', 'app-build-manifest.json', 'react-loadable-manifest.json', 'app-path-routes-manifest.json'].map((f) => join(root, '.next', f)).filter(existsSync)
    for (const f of files) addAllTokens(readFileSync(f, 'utf8'))
    // App Router chunk lists (Turbopack builds have no app-build-manifest.json): *_client-reference-manifest.js under .next/server
    const serverDir = join(root, '.next', 'server')
    let referenceManifests = 0
    if (existsSync(serverDir)) {
      for (const f of walk(serverDir, { extensions: ['.js'] })) {
        if (!/_client-reference-manifest\.js$|middleware-build-manifest\.js$|server-reference-manifest\.js$/.test(f)) continue
        addAllTokens(readFileSync(f, 'utf8'))
        referenceManifests++
      }
    }
    if (files.length) source = `${files.map((f) => toPosix(relative(root, f))).join(', ')}${referenceManifests ? ` + ${referenceManifests} client reference manifest(s)` : ''}`
    // only a webpack build publishes the complete app chunk list; otherwise unreferenced chunks stay measured
    complete = files.some((f) => f.endsWith('app-build-manifest.json'))
    const idFile = join(root, '.next', 'BUILD_ID')
    if (existsSync(idFile)) buildId = readFileSync(idFile, 'utf8').trim()
    // chunks of the current build live under static/<BUILD_ID>/; other ids are leftovers
    if (buildId && existsSync(outputDir)) {
      for (const f of walk(outputDir, { extensions: ['.js', '.css'] })) {
        const rel = toPosix(relative(outputDir, f))
        const m = /^([^/]+)\/_(?:build|ssg)Manifest\.js$/.exec(rel)
        if (m && m[1] !== buildId && !otherBuilds.some((b) => b.id === m[1])) otherBuilds.push({ id: m[1], timestamp: null })
        if (rel.startsWith(`${buildId}/`)) addToken(rel)
      }
    }
  } else if (kind === 'vite') {
    const manifestFile = firstExisting(join(outputDir, '..', '.vite', 'manifest.json'), join(outputDir, '..', 'manifest.json'))
    if (manifestFile) {
      const manifest = readJson(manifestFile)
      if (manifest && typeof manifest === 'object') {
        for (const entry of Object.values(manifest)) {
          addToken(entry.file)
          for (const c of entry.css ?? []) addToken(c)
          for (const a of entry.assets ?? []) addToken(a)
        }
        source = toPosix(relative(root, manifestFile))
      }
    }
  }
  return names.size ? { names, source, buildId, otherBuilds, importers, complete } : (buildId || otherBuilds.length ? { names, source: null, buildId, otherBuilds, importers: null, complete: false } : null)
}

/** Tolerant parser of Nuxt's minified client.manifest.mjs: Map key -> { file, isEntry, imports, css }. */
export function parseNuxtManifest(text) {
  const entries = new Map()
  const objStart = text.indexOf('{')
  if (objStart < 0) return entries
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
  return entries
}

export function isEntry(kind, rel) {
  const name = rel.split('/').pop()
  if (kind === 'nuxt') return /^entry[.-]/.test(name)
  if (kind === 'next') return /^(?:main-app|main|webpack|framework|polyfills)[-.]/.test(name) || /^chunks\/app\/(?:layout|page)-/.test(rel) || /^css\//.test(rel)
  if (kind === 'vite') return /^index[.-]/.test(name)
  return false
}
