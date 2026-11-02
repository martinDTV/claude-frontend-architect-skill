#!/usr/bin/env node
// Route attribution and rendering-strategy intelligence (1.6 increment 4): reads an existing production build and a
// static scan and explains, per route, which JavaScript and CSS the build associates with it, what is initial versus
// deferred, which chunks are shared, which rendering strategy the build actually produced, and which static perf-audit
// findings touch that route. It never builds, never downloads, never contacts the network. It reuses bundle-budget's
// manifest readers (lib/bundle.mjs) — this is not a second dependency graph and not a second budget system; it attributes
// and explains, bundle-budget measures against budgets.
//
// The honesty contract (every number carries its source and a confidence):
//   - a *built* chunk (exists in the output) is not a *route-associated* chunk (a manifest ties it to a route) is not a
//     *browser-requested* chunk (observed loading) is not *transferred* / *evaluated* / *used* JavaScript. These are
//     never equated; this tool reports up to "route-associated" from the build, and defers transferred/used to the
//     browser checks (browser-audit vitals/interactions/hydration-cost) and the Coverage panel.
//   - a shared chunk is counted once; a route's associated size never sums a shared chunk per importer.
//   - when a build artifact does not expose a route's chunks or a route's effective strategy (e.g. a Turbopack build
//     with no app-build-manifest, a Nuxt manifest at an unsupported path, a decision that depends on the deploy adapter
//     or an external cache), the field is reported as not verifiable with this artifact, with the reason — never guessed.
//
// Usage: route-attribution.mjs <project-root> [--dir path] [--json|--md]
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { firstExisting, readJson, toPosix, walk } from './lib/fs.mjs'
import { detectProject, excludeArg, loadConfig } from './lib/project.mjs'
import { buildInventory, detectOutput, parseNuxtManifest, VENDOR_HINTS } from './lib/bundle.mjs'
import { addFinding, createReport, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

const HELP = `
route-attribution — what JavaScript/CSS each route loads, its rendering strategy, and the static findings on it.

usage: node route-attribution.mjs <project-root> [options]
  --dir <path>        build output directory (auto: .output/public/_nuxt, .next/static, dist/assets)
  --no-perf           skip the perf-audit correlation (faster; just attribution and strategy)
  --json | --md       output format
  --fail-on <level>   exit 1 on: confirmed | any | none (default: none — this tool explains, it does not gate)

What it reads (read-only, no build):
  Next.js  .next/server/app/<route>/page_client-reference-manifest.js (route -> client chunks),
           .next/prerender-manifest.json (static vs ISR, revalidate), routes-manifest.json (static/dynamic),
           app-path-routes-manifest.json (routes). Turbopack builds have no app-build-manifest.json: the
           server-side RSC/module cost is not attributed, only the client chunks a route references.
  Nuxt     .output/server/chunks/build/client.manifest.mjs (page keys -> file + imports + css) when present,
           else .output/server/chunks/virtual/precomputed.mjs (node-server builds); the effective rendering
           strategy of a Nuxt route lives in the app config (ssr, routeRules), read by routes-audit, not in
           the client bundle — reported from the project config with its confidence.
  Static   perf-audit.mjs findings mapped to the route's source file (heavy-static-import, provider-inline-value,
           list-key-unstable, computed-side-effect, reactive-deep-watch). A finding is never promoted to confirmed
           by this tool; attribution adds build evidence beside it, it does not change its level.

Confidence: "build-manifest" (a manifest ties the route to these chunks), "config" (the project config declares it),
"heuristic" (inferred from names/paths, verify), "unavailable" (the artifact does not expose it; the reason is given).
`

const kb = (n) => (n == null ? null : Math.round((n / 1024) * 10) / 10)

// ----- size measurement: one chunk measured once (raw + gzip from the file on disk) -------------------------------
function makeSizer(outputDir, kind) {
  const cache = new Map()
  // index files by basename and by output-relative path so a manifest reference resolves whatever form it uses
  const byName = new Map()
  if (existsSync(outputDir)) {
    for (const file of walk(outputDir, { extensions: ['.js', '.mjs', '.css'] })) {
      if (/\.map$/.test(file)) continue
      const rel = toPosix(relative(outputDir, file))
      byName.set(rel, file)
      byName.set(rel.split('/').pop(), file)
    }
  }
  // Next chunk refs come as "/_next/static/chunks/x.js" (RSC manifest) or "static/chunks/x.js" (entryJSFiles); the
  // files live under .next/static/chunks/x.js, i.e. output-relative "chunks/x.js". Nuxt refs may carry a leading "_".
  // The key must be stable across the ref's forms so a shared chunk dedupes to one key (counted once).
  const normalize = (ref) => {
    const r = ref.replace(/^\/?_next\/static\//, '').replace(/^static\//, '').replace(/^\/?/, '')
    // for Nuxt flat outputs the chunk is a bare basename; drop a leading "_" only when the de-underscored file exists
    const bare = r.split('/').pop()
    if (kind === 'nuxt' && bare.startsWith('_') && byName.has(bare.replace(/^_/, '')) && !byName.has(bare)) return bare.replace(/^_/, '')
    return r
  }
  const measure = (ref) => {
    const key = normalize(ref)
    if (cache.has(key)) return cache.get(key)
    // Nuxt manifests prefix shared chunk refs with "_" (e.g. "_DVRkMeDb.js") while the file on disk is "DVRkMeDb.js";
    // try the ref, its basename, and the "_"-stripped forms so an aliased shared chunk still resolves to its file.
    const bare = key.split('/').pop()
    const file = byName.get(key) ?? byName.get(bare) ?? byName.get(key.replace(/(^|\/)_/, '$1')) ?? byName.get(bare.replace(/^_/, ''))
    let sz = { ref, found: false, raw: null, gzip: null }
    if (file) {
      const buf = readFileSync(file)
      sz = { ref, found: true, file: toPosix(relative(outputDir, file)), type: /\.css$/.test(file) ? 'css' : 'js', raw: buf.length, gzip: gzipSync(buf).length }
    }
    cache.set(key, sz)
    return sz
  }
  // sum a set of refs once (dedupe by normalized key); return {rawBytes, gzipBytes, files:[...], missing:[...]}
  const sumUnique = (refs) => {
    const seen = new Set()
    let raw = 0, gzip = 0
    const files = [], missing = []
    for (const ref of refs) {
      const key = normalize(ref)
      if (seen.has(key)) continue
      seen.add(key)
      const s = measure(ref)
      if (s.found) { raw += s.raw; gzip += s.gzip; files.push({ file: s.file, type: s.type, gzip: s.gzip, raw: s.raw }) }
      else missing.push(ref)
    }
    files.sort((a, b) => b.gzip - a.gzip)
    return { rawBytes: raw, gzipBytes: gzip, files, missing }
  }
  return { measure, sumUnique }
}

// ----- Next.js adapter -------------------------------------------------------------------------------------------
function nextRouteChunks(root) {
  // one *_client-reference-manifest.js per route with client components: __RSC_MANIFEST["/route/page"]
  const serverApp = join(root, '.next', 'server', 'app')
  const routes = new Map() // routePath -> { initialJs:Set, css:Set, source }
  if (!existsSync(serverApp)) return routes
  for (const f of walk(serverApp, { extensions: ['.js'] })) {
    if (!/page_client-reference-manifest\.js$|route_client-reference-manifest\.js$/.test(f)) continue
    const text = readFileSync(f, 'utf8')
    const m = /__RSC_MANIFEST\[("|')((?:\\.|[^\\])*?)\1\]\s*=\s*(\{[\s\S]*\});?\s*$/.exec(text)
    if (!m) continue
    let obj
    try { obj = JSON.parse(m[3]) } catch { continue }
    const key = m[2].replace(/\/page$/, '').replace(/\/route$/, '') || '/'
    const initialJs = new Set()
    const css = new Set()
    // entryJSFiles/entryCSSFiles are maps module -> [chunk, ...] (Turbopack) or flat arrays; flatten deeply to strings
    const flatten = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(flatten) : v && typeof v === 'object' ? Object.values(v).flatMap(flatten) : [])
    for (const c of flatten(obj.entryJSFiles)) initialJs.add(c)
    for (const c of flatten(obj.entryCSSFiles)) css.add(c)
    for (const mod of Object.values(obj.clientModules ?? {})) {
      // async:true modules are referenced for lazy loading, not part of the route's initial client set
      const bucket = mod.async ? null : initialJs
      for (const c of mod.chunks ?? []) { if (/\.css$/.test(c)) css.add(c); else if (bucket) bucket.add(c) }
    }
    routes.set(key, { initialJs, css, deferredJs: new Set(), source: toPosix(relative(root, f)) })
  }
  return routes
}

function nextStrategy(root) {
  // prerender-manifest: compute=static + initialRevalidateSeconds (false=SSG, number=ISR); routes-manifest: static/dynamic
  const prerender = readJson(join(root, '.next', 'prerender-manifest.json'))
  const routesManifest = readJson(join(root, '.next', 'routes-manifest.json'))
  const strat = new Map()
  const staticSet = new Set((routesManifest?.staticRoutes ?? []).map((r) => r.page))
  const dynamicSet = new Set((routesManifest?.dynamicRoutes ?? []).map((r) => r.page))
  const pre = prerender?.routes ?? {}
  const dyn = prerender?.dynamicRoutes ?? {}
  for (const [route, info] of Object.entries(pre)) {
    const revalidate = info.initialRevalidateSeconds
    const strategy = revalidate === false || revalidate == null ? 'SSG (prerendered at build)' : `ISR (prerendered, revalidate ${revalidate}s)`
    strat.set(route, { strategy, evidence: 'prerender-manifest.json', confidence: 'build-manifest', compute: info.compute ?? null, revalidate: revalidate === false ? null : revalidate, htmlSize: info.htmlSize ?? null })
  }
  for (const [route, info] of Object.entries(dyn)) {
    if (!strat.has(route)) strat.set(route, { strategy: `ISR/dynamic (fallback ${info.fallback === false ? 'blocking/none' : 'yes'}, revalidate ${info.initialRevalidateSeconds ?? 'n/a'})`, evidence: 'prerender-manifest.json dynamicRoutes', confidence: 'build-manifest', revalidate: info.initialRevalidateSeconds ?? null })
  }
  return { strat, staticSet, dynamicSet, hasPrerender: Boolean(prerender) }
}

function nextAttribution(root, outputDir) {
  const chunks = nextRouteChunks(root)
  const { strat, staticSet, dynamicSet, hasPrerender } = nextStrategy(root)
  const sizer = makeSizer(outputDir, 'next')
  // every route we can see from any source
  const allRoutes = new Set([...chunks.keys(), ...strat.keys(), ...staticSet, ...dynamicSet])
  // shared chunk detection: a chunk referenced by >=2 routes' initial sets is shared
  const refCount = new Map()
  for (const { initialJs } of chunks.values()) for (const c of initialJs) refCount.set(c, (refCount.get(c) ?? 0) + 1)
  const records = []
  for (const route of [...allRoutes].sort()) {
    if (route.startsWith('/_') || route.startsWith('/api/') || route === '/favicon.ico') continue
    const ch = chunks.get(route)
    const s = strat.get(route)
    let strategy, stratEvidence, stratConfidence
    if (s) { strategy = s.strategy; stratEvidence = s.evidence; stratConfidence = s.confidence }
    else if (dynamicSet.has(route)) { strategy = 'dynamic (server-rendered per request)'; stratEvidence = 'routes-manifest.json dynamicRoutes'; stratConfidence = 'build-manifest' }
    else if (staticSet.has(route) && !hasPrerender) { strategy = 'static (listed, prerender manifest unavailable)'; stratEvidence = 'routes-manifest.json staticRoutes'; stratConfidence = 'heuristic' }
    else { strategy = 'server-rendered or client-rendered (not prerendered at build)'; stratEvidence = 'absent from prerender-manifest.json'; stratConfidence = 'build-manifest' }
    let attribution
    if (ch) {
      const initial = sizer.sumUnique([...ch.initialJs])
      const css = sizer.sumUnique([...ch.css])
      const shared = [...ch.initialJs].filter((c) => (refCount.get(c) ?? 0) >= 2)
      attribution = {
        source: ch.source, confidence: 'build-manifest',
        initialClientJs: { gzipKb: kb(initial.gzipBytes), rawKb: kb(initial.rawBytes), files: initial.files.length, missing: initial.missing.length },
        css: { gzipKb: kb(css.gzipBytes), files: css.files.length },
        sharedChunks: shared.length, sharedNote: shared.length ? 'these chunks are also referenced by other routes; counted once here, not once per route' : null,
        deferred: { note: 'next/dynamic chunks are listed in react-loadable-manifest.json when a webpack build emits it; a Turbopack build does not, so deferred client chunks are not separately attributed here', verifiable: false },
        topFiles: initial.files.slice(0, 5).map((f) => `${f.file} (${kb(f.gzip)} KB gzip)`),
        largestInitialKb: initial.files[0] ? kb(initial.files[0].gzip) : null,
      }
    } else {
      attribution = { source: null, confidence: 'unavailable', reason: 'no client-reference manifest for this route (a pure Server Component route ships no client chunk set, or the build did not emit one); the server/RSC cost of this route is not attributed from a Turbopack build' }
    }
    records.push({ route, strategy, strategyEvidence: stratEvidence, strategyConfidence: stratConfidence, attribution })
  }
  return { records, note: hasPrerender ? null : 'prerender-manifest.json not found: static/ISR classification is heuristic' }
}

// ----- Nuxt adapter ----------------------------------------------------------------------------------------------
// Map a page module specifier to a route path: pages/index.vue -> /, pages/a/b.vue -> /a/b, pages/a/index.vue -> /a,
// pages/[slug].vue -> /:slug (dynamic). Returns null for non-page modules.
function pageToRoute(spec) {
  const m = /(?:^|\/)pages\/(.+)\.vue$/.exec(spec)
  if (!m) return null
  let p = m[1].replace(/\/index$/, '').replace(/^index$/, '')
  p = p.replace(/\[([^\]]+)\]/g, ':$1')
  return '/' + p
}

// Parse the node-server precomputed.mjs: per page module, its preload entry has file + imports (static chunks) and
// prefetch flags. Returns Map<spec, { file, imports:[], css:[], prefetch:[], dynamicImports:[] }>. Tolerant: the file
// is a factory with aliased chunk objects, so we read the inline `{...file:"x.js"...}` blocks per page.
function parseNuxtPrecomputed(text) {
  const out = new Map()
  const readBalanced = (open) => { // open = index of a "{"; returns [objText, endIndex]
    let depth = 0
    for (let i = open; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') { depth--; if (!depth) return [text.slice(open, i + 1), i] } }
    return [text.slice(open), text.length]
  }
  // Walk the top-level dependencies object once; its depth-1 keys are the module specs. A page entry is
  // "pages/....vue":{scripts,styles,preload,prefetch}. Only the top-level page entries are read (the same spec also
  // appears nested as a preload key inside other pages — those are skipped by tracking brace depth).
  const depsIdx = text.indexOf('dependencies:{')
  if (depsIdx < 0) return out
  const depsOpen = text.indexOf('{', depsIdx)
  let depth = 0
  for (let i = depsOpen; i < text.length; i++) {
    const c = text[i]
    if (c === '{') { depth++; continue }
    if (c === '}') { depth--; if (depth === 0) break; continue }
    // at depth 1, a `"...pages/X.vue":{` is a top-level page entry
    if (depth === 1 && c === '"') {
      const keyMatch = /^"((?:[^"\\]|\\.)*)"\s*:\s*\{/.exec(text.slice(i))
      if (keyMatch && /(?:^|\/)pages\/.+\.vue$/.test(keyMatch[1])) {
        const spec = keyMatch[1]
        const [body, bodyEnd] = readBalanced(i + keyMatch[0].length - 1)
        // CSS: the keys of styles:{ "x.css": <var> } are the stylesheet filenames
        let css = []
        const stylesIdx = body.indexOf('styles:{')
        if (stylesIdx >= 0) { const [stylesObj] = readBalanced(body.indexOf('{', stylesIdx)); css = [...stylesObj.matchAll(/"([^"]+\.css)"\s*:/g)].map((x) => x[1]) }
        // the page's own chunk descriptor is the preload entry whose src is this spec: read its file + static imports
        let file = null, imports = []
        const srcRe = new RegExp(`\\{[^{}]*?\\bsrc:"${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^{}]*?\\}`)
        const own = srcRe.exec(body)?.[0] ?? null
        if (own) {
          file = /\bfile:"([^"]+)"/.exec(own)?.[1] ?? null
          const descStart = body.indexOf(own)
          const im = /\bimports:\[([^\]]*)\]/.exec(body.slice(descStart))
          if (im) imports = [...im[1].matchAll(/"([^"]+\.(?:m?js))"/g)].map((x) => x[1]).filter((f) => !f.includes('/node_modules/'))
        }
        out.set(spec, { file, scripts: file ? [file] : [], css, imports: [...new Set(imports)], prefetch: /prefetch:true/.test(body) })
        i = bodyEnd // skip the whole page entry's body so its braces don't affect depth
      }
    }
  }
  return out
}

function nuxtAttribution(root, outputDir, project) {
  const sizer = makeSizer(outputDir, 'nuxt')
  // 1. preferred: client.manifest.mjs (bundle-budget's parser) when present at the standard path
  const stdManifest = firstExisting(join(root, '.output', 'server', 'chunks', 'build', 'client.manifest.mjs'))
  let pages = new Map() // route -> { initial:Set, css:Set, deferred:Set, source }
  let source = null
  let confidence = 'build-manifest'
  if (stdManifest) {
    const entries = parseNuxtManifest(readFileSync(stdManifest, 'utf8'))
    source = toPosix(relative(root, stdManifest))
    // build importers once for shared detection
    for (const [key, e] of entries) {
      const route = pageToRoute(key)
      if (!route || !e.file) continue
      const initial = new Set([e.file, ...e.imports.map((i) => i.replace(/^_/, ''))])
      pages.set(route, { initial, css: new Set(e.css), deferred: new Set(), source })
    }
  } else {
    // fallback: the node-server precomputed.mjs at the virtual path
    const pre = firstExisting(join(root, '.output', 'server', 'chunks', 'virtual', 'precomputed.mjs'), join(root, '.output', 'server', 'chunks', 'build', 'client.precomputed.mjs'))
    if (pre) {
      source = toPosix(relative(root, pre))
      const parsed = parseNuxtPrecomputed(readFileSync(pre, 'utf8'))
      for (const [spec, info] of parsed) {
        const route = pageToRoute(spec)
        if (!route) continue
        const initial = new Set([...(info.file ? [info.file] : []), ...info.scripts, ...info.imports])
        pages.set(route, { initial, css: new Set(info.css), deferred: new Set(), source })
      }
    }
  }
  // shared chunk detection across routes (counted once per route)
  const refCount = new Map()
  for (const { initial } of pages.values()) for (const c of initial) refCount.set(c, (refCount.get(c) ?? 0) + 1)
  // render strategy: Nuxt build artifact here carries no per-route strategy; it comes from the app config (routes-audit)
  const ssr = project.nuxt?.ssr
  const ruleSsrFalse = new Set(project.nuxt?.routeRulesSsrFalse ?? [])
  const records = []
  for (const route of [...pages.keys()].sort()) {
    const p = pages.get(route)
    const initial = sizer.sumUnique([...p.initial])
    const css = sizer.sumUnique([...p.css])
    const shared = [...p.initial].filter((c) => (refCount.get(c) ?? 0) >= 2)
    // strategy from config, with explicit confidence (textual config read, not the build artifact).
    // detectProject reads ssr:false lexically and cannot tell an app-level ssr:false from one inside routeRules, so
    // when ssr:false route rules exist the app-level reading is ambiguous: report the app default as SSR with a lower
    // confidence and name the ambiguity, rather than wrongly declaring the whole app CSR.
    let strategy, stratEvidence, stratConfidence
    const matchedRule = [...ruleSsrFalse].find((g) => { const base = g.replace(/\/?\*+$/, ''); return route === g || route === base || route.startsWith(base + '/') })
    const ssrFalseOnlyInRules = ssr === false && ruleSsrFalse.size > 0
    if (matchedRule) { strategy = 'client-only for this route (routeRules ssr:false)'; stratEvidence = `nuxt.config routeRules "${matchedRule}"`; stratConfidence = 'config' }
    else if (ssrFalseOnlyInRules) { strategy = 'SSR (app default; an ssr:false appears only in routeRules, so the app-level value is read ambiguously — confirm the top-level ssr in nuxt.config)'; stratEvidence = 'nuxt.config (ssr:false seen in routeRules; app-level ambiguous)'; stratConfidence = 'heuristic' }
    else if (ssr === false) { strategy = 'CSR (app-wide ssr:false)'; stratEvidence = 'nuxt.config ssr:false'; stratConfidence = 'config' }
    else if (ssr === true) { strategy = 'SSR (app default; prerender/ISR depend on routeRules and the deploy preset, not verifiable from this build)'; stratEvidence = 'nuxt.config ssr:true (default)'; stratConfidence = 'config' }
    else { strategy = 'not verifiable (nuxt.config not read)'; stratEvidence = null; stratConfidence = 'unavailable' }
    records.push({
      route, strategy, strategyEvidence: stratEvidence, strategyConfidence: stratConfidence,
      attribution: {
        source, confidence,
        initialClientJs: { gzipKb: kb(initial.gzipBytes), rawKb: kb(initial.rawBytes), files: initial.files.length, missing: initial.missing.length },
        css: { gzipKb: kb(css.gzipBytes), files: css.files.length },
        sharedChunks: shared.length, sharedNote: shared.length ? 'these chunks are also referenced by other routes; counted once here, not once per route' : null,
        deferred: { note: 'prefetch/dynamicImports are preloaded opportunistically, not part of the initial set; not separately sized here', verifiable: false },
        topFiles: initial.files.slice(0, 5).map((f) => `${f.file} (${kb(f.gzip)} KB gzip)`),
        largestInitialKb: initial.files[0] ? kb(initial.files[0].gzip) : null,
      },
    })
  }
  return { records, note: source ? null : 'no Nuxt client manifest found at the known paths (.output/server/chunks/build/client.manifest.mjs or .output/server/chunks/virtual/precomputed.mjs): per-route attribution is unavailable for this build' }
}

// ----- perf-audit correlation ------------------------------------------------------------------------------------
// Map perf-audit findings to a route by their source file, without changing their level (see correlationNote below): a
// heavy-static-import whose library name shows up in the route's associated chunks gets a build-backed note; one that
// does not (dynamic/server-only/tree-shaken) gets the opposite note. A finding's level is never promoted here.

export function run(argv) {
  const args = parseArgs(argv)
  if (args.help || !args._[0]) return usage(HELP)
  const root = resolve(args._[0])
  if (!existsSync(join(root, 'package.json'))) return fail(`no package.json in ${root}`)
  let config
  try { config = loadConfig(root, args.config, { exclude: excludeArg(args) }) } catch (error) { return fail(error.message) }
  const project = detectProject(root, config)
  const report = createReport('route-attribution', project)
  const output = args.dir ? { dir: resolve(root, String(args.dir)), kind: project.framework === 'nuxt' ? 'nuxt' : project.framework === 'next' ? 'next' : 'vite' } : detectOutput(root)
  if (!output || !existsSync(output.dir)) return fail('no production build found (.output/public/_nuxt, .next/static or dist/assets). Build the project first; this tool measures, it does not build.')

  let result
  if (output.kind === 'next') result = nextAttribution(root, output.dir)
  else if (output.kind === 'nuxt') result = nuxtAttribution(root, output.dir, project)
  else return fail(`route attribution supports Nuxt and Next.js builds; "${output.kind}" is not supported (Vite SPA has one entry, use bundle-budget)`)

  if (result.note) report.notes.push(result.note)

  // perf-audit correlation (opt-out with --no-perf): run perf-audit as a read-only subprocess and attach its findings
  // to routes by source file. Spawning (not importing) keeps it decoupled and avoids truncating a large --json stream.
  let perfReport = null
  if (!args['no-perf']) {
    const r = spawnSync(process.execPath, [join(SCRIPT_DIR, 'perf-audit.mjs'), root, '--json', '--fail-on', 'none'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    try { perfReport = JSON.parse(r.stdout) } catch { report.notes.push('perf-audit correlation skipped (perf-audit.mjs did not return JSON)') }
  }
  const perfByFile = new Map()
  if (perfReport?.findings) for (const f of perfReport.findings) { if (!f.file) continue; if (!perfByFile.has(f.file)) perfByFile.set(f.file, []); perfByFile.get(f.file).push({ id: f.id, level: f.level, line: f.line, evidence: f.evidence, message: f.message }) }

  // attach perf findings to a route when the finding's file sits under the route's source path (best-effort, heuristic)
  for (const rec of result.records) {
    const related = []
    for (const [file, fs] of perfByFile) {
      if (routeOwnsFile(output.kind, rec.route, file)) for (const f of fs) related.push({ ...f, file, correlation: correlationNote(f, rec) })
    }
    if (related.length) rec.staticFindings = related
  }

  const withChunks = result.records.filter((r) => r.attribution.confidence === 'build-manifest').length
  const unavailable = result.records.filter((r) => r.attribution.confidence === 'unavailable').length
  report.summary = {
    framework: output.kind, output: toPosix(relative(root, output.dir)), buildId: (buildInventory(root, output.kind, output.dir)?.buildId) ?? null,
    routes: result.records.length, routesWithBuildAttribution: withChunks, routesAttributionUnavailable: unavailable,
    perfCorrelation: perfReport ? `${perfReport.findings?.length ?? 0} perf finding(s) considered` : 'not run',
    note: 'initial client JS is what the build associates with the route (built + route-associated); it is not bytes transferred, evaluated or used. Confirm transfer with browser-audit (vitals/interactions/hydration-cost) and the Coverage panel.',
  }
  report.data = { routes: result.records }

  // one info finding per route that carries build attribution, summarising it; never confirmed (this tool explains)
  for (const rec of result.records) {
    if (rec.attribution.confidence !== 'build-manifest') continue
    const a = rec.attribution
    addFinding(report, { id: 'route-attribution', level: 'info', severity: 'info', file: rec.route,
      message: `${rec.route}: ${rec.strategy} (${rec.strategyConfidence}); initial client JS ${a.initialClientJs.gzipKb ?? '?'} KB gzip over ${a.initialClientJs.files} file(s)${a.sharedChunks ? `, ${a.sharedChunks} shared` : ''}${a.css.gzipKb ? `, CSS ${a.css.gzipKb} KB` : ''}${rec.staticFindings?.length ? `; ${rec.staticFindings.length} static finding(s)` : ''}`,
      fix: 'build-associated size, not transferred/used bytes; confirm with the browser checks and Coverage. Evidence: ' + (a.source ?? 'n/a') })
    // a large single chunk in the initial set is where a heavy dependency usually lives; name the static candidates on
    // this route, if any, but stay heuristic — hashed chunk names do not reveal the library, so this is a lead to verify
    // with the analyzer (nuxi analyze / @next/bundle-analyzer), not a confirmed attribution of bytes to a library.
    if (a.largestInitialKb != null && a.largestInitialKb >= 150) {
      const heavy = (rec.staticFindings ?? []).filter((f) => f.id === 'heavy-static-import')
      addFinding(report, { id: 'route-heavy-initial-chunk', level: 'heuristic', severity: 'medium', file: rec.route,
        message: `${rec.route}: a ${a.largestInitialKb} KB gzip chunk is in the initial set (largest of ${a.initialClientJs.files})${heavy.length ? `; heavy static import(s) on this route name a candidate: ${heavy.map((f) => f.evidence).filter(Boolean).join(', ')}` : ''}`,
        fix: 'a chunk this large on load is worth confirming: open it in the analyzer to see which dependency it is, and whether it can move out of the initial set (dynamic import, lazy/async component, client-only below the fold). A 3D or editor experience that genuinely needs the weight on this route is not a defect — decide against the route\'s requirements. Hashed chunk names hide the library, so this is a lead, not a verdict' })
    }
  }
  for (const rec of result.records) {
    if (rec.attribution.confidence === 'unavailable') addFinding(report, { id: 'route-attribution-unavailable', level: 'info', severity: 'info', file: rec.route, message: `${rec.route}: ${rec.strategy}; chunk attribution unavailable — ${rec.attribution.reason}`, fix: 'this is a limit of the build artifact, not a defect; a webpack build (Next) or the standard client.manifest.mjs (Nuxt) would attribute it' })
  }

  const sections = [
    { title: 'Routes', table: { headers: ['route', 'strategy', 'confidence', 'initial JS KB', 'shared', 'CSS KB', 'static findings', 'evidence'],
      rows: result.records.map((r) => [r.route, r.strategy, r.strategyConfidence, r.attribution.initialClientJs?.gzipKb ?? '-', r.attribution.sharedChunks ?? '-', r.attribution.css?.gzipKb ?? '-', r.staticFindings?.length ?? 0, r.attribution.source ?? r.attribution.reason ?? '-']) } },
  ]
  report.notes.push('a built chunk is not a route-associated chunk is not a browser-requested chunk is not transferred/evaluated/used JavaScript; this tool reports up to route-associated, the browser checks report transfer and the Coverage panel reports used.')
  report.analysis = `build: ${output.kind}; routes: ${result.records.length}; with build attribution: ${withChunks}; attribution unavailable: ${unavailable}`
  return finish(report, args, { sections })
}

function routeOwnsFile(kind, route, file) {
  // heuristic mapping of a route to its source file(s); best-effort, documented as heuristic in the finding note
  const f = file.replace(/\\/g, '/')
  if (kind === 'next') {
    const seg = route === '/' ? '' : route.replace(/^\//, '')
    return new RegExp(`(?:^|/)app/${seg ? seg + '/' : ''}(page|layout)\\.(t|j)sx?$`).test(f) || (seg && f.includes(`/features/${seg.split('/')[0]}/`))
  }
  if (kind === 'nuxt') {
    const seg = route === '/' ? 'index' : route.replace(/^\//, '').replace(/:(\w+)/g, '[$1]')
    return new RegExp(`(?:^|/)pages/${seg}(/index)?\\.vue$`).test(f) || new RegExp(`(?:^|/)pages/${seg}\\.vue$`).test(f)
  }
  return false
}

function correlationNote(finding, rec) {
  if (finding.id !== 'heavy-static-import') return 'static finding on this route; its build impact depends on where it is imported'
  const lib = (finding.evidence || '').toLowerCase()
  const vendor = VENDOR_HINTS.find((v) => lib.includes(v))
  const top = (rec.attribution.topFiles || []).join(' ').toLowerCase()
  if (vendor && top.includes(vendor)) return `the library "${vendor}" also appears in this route's associated chunk names: build evidence is consistent with it reaching this route's bundle (verify it is in the initial set, not a lazy chunk, with the analyzer)`
  return 'the heavy import is in this route\'s source, but its library name is not visible in this route\'s associated chunk names (it may be tree-shaken, dynamically imported, server-only, or bundled under a hashed chunk): the static finding stays heuristic; confirm with the analyzer before acting'
}

if (isMainModule(import.meta.url)) process.exitCode = run(process.argv.slice(2))
