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
import { detectProject, excludeArg, loadConfig } from './lib/project.mjs'
import { addFinding, createReport, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'
import { DEFAULT_BUDGETS, VENDOR_HINTS, buildInventory, detectOutput, isEntry, manifestEntries } from './lib/bundle.mjs'

const HELP = `
bundle-budget — size of the built assets against budgets (gzip, exact; no build is triggered).

usage: node bundle-budget.mjs <project-root> [options]
  --dir <path>        build output directory (auto: .output/public/_nuxt, .next/static, dist/assets)
  --html <file>       a saved rendered page (curl the deployed URL) used to identify the startup assets
  --budgets <file>    JSON with budgets in KB (gzip): { "entryJsKb": 250, "entryCssKb": 60, "maxChunkKb": 300, "totalJsKb": 2000 }
                      (also read from "budgets" in .frontend-audit.json)
  --top <n>           largest files to list (default 15)
  --exclude <globs>   comma-separated project-relative globs to leave out (also "exclude" in .frontend-audit.json)
  --json | --md       output format
  --fail-on <level>   exit 1 on: confirmed (default; a budget breach is confirmed) | any | none

Startup assets, in order of preference: --html, a rendered index.html/200.html in the output, the
Nuxt client manifest (.output/server/chunks/build/client.manifest.mjs or client.precomputed.mjs),
Next.js build-manifest.json; otherwise file-name conventions (Nuxt 4 hash-only names give nothing and
entry metrics are reported as unknown).

Scope (1.3): when a build manifest lists the assets of the current build, only those are measured
(assetScope "manifest"); files in the output directory that no manifest references are leftovers of an
earlier build, reported as stale-build-artifacts with their own size and never added to the totals.
Without a manifest every file is measured (assetScope "directory") and stale files cannot be told apart.
Nuxt build ids come from .output/public/_nuxt/builds/latest.json and builds/meta/*.json.
`


export function run(argv) {
  const args = parseArgs(argv)
  if (args.help || !args._[0]) return usage(HELP)
  const root = resolve(args._[0])
  if (!existsSync(join(root, 'package.json'))) return fail(`no package.json in ${root}`)
  let config
  try {
    config = loadConfig(root, args.config, { exclude: excludeArg(args) })
  } catch (error) {
    return fail(error.message)
  }
  const project = detectProject(root, config)
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
  const inventory = buildInventory(root, output.kind, output.dir)
  const scoped = Boolean(inventory?.names?.size)
  const inInventory = (rel) => inventory.names.has(rel) || (output.kind === 'nuxt' && inventory.names.has(rel.split('/').pop()))
  const assets = []
  for (const file of walk(output.dir, { extensions: ['.js', '.mjs', '.css'] })) {
    if (/\.map$/.test(file)) continue
    const buf = readFileSync(file)
    const rel = toPosix(relative(output.dir, file))
    const entry = fromManifest ? fromManifest.names.has(rel) || fromManifest.names.has(rel.split('/').pop()) : isEntry(output.kind, rel)
    // current = referenced by the build manifest; stale = provably from another build (complete inventory, or a
    // directory of another BUILD_ID); unreferenced = not in an incomplete inventory, still measured; unknown = no manifest
    const otherBuildDir = inventory?.otherBuilds?.some((b) => rel.startsWith(`${b.id}/`))
    const scope = !scoped ? 'unknown' : inInventory(rel) ? 'current' : (inventory.complete || otherBuildDir) ? 'stale' : 'unreferenced'
    const sharedBy = inventory?.importers ? (inventory.importers.get(rel)?.size ?? inventory.importers.get(rel.split('/').pop())?.size ?? 0) : null
    assets.push({ file: rel, type: /\.css$/.test(file) ? 'css' : 'js', raw: buf.length, gzip: gzipSync(buf).length, entry, scope, sharedBy, mtime: statSync(file).mtime.toISOString() })
  }
  report.notes.push(fromManifest ? `startup assets taken from ${fromManifest.source}` : 'startup assets guessed from file names (no HTML or manifest found); prefer running from the project root after a build')
  if (!assets.length) return fail(`no .js/.css assets under ${output.dir}`)
  assets.sort((a, b) => b.gzip - a.gzip)
  const kb = (n) => Math.round((n / 1024) * 10) / 10
  const sum = (list, key) => list.reduce((n, a) => n + a[key], 0)
  // Only the current build is measured; leftovers of earlier builds are reported, never summed.
  const stale = assets.filter((a) => a.scope === 'stale')
  const measured = assets.filter((a) => a.scope !== 'stale')
  const unreferenced = assets.filter((a) => a.scope === 'unreferenced')
  if (scoped) report.notes.push(`asset scope: ${measured.length} file(s) measured${inventory.source ? ` against ${inventory.source}` : ''}${inventory.buildId ? ` (build ${inventory.buildId})` : ''}${stale.length ? `; ${stale.length} file(s) from earlier builds excluded as stale` : ''}${unreferenced.length ? `; ${unreferenced.length} file(s) not referenced by the manifests read were kept (the inventory of this bundler is not complete, so they cannot be called stale)` : ''}`)
  else report.notes.push('asset scope: no build manifest found, every file in the output directory is measured; leftovers of earlier builds cannot be told apart from the current build')
  if (stale.length) {
    addFinding(report, { id: 'stale-build-artifacts', level: 'info', severity: 'low', file: toPosix(relative(root, output.dir)), message: `${stale.length} asset(s), ${kb(sum(stale, 'gzip'))} KB gzip, are not referenced by the current build manifest${inventory.otherBuilds.length ? ` (other build id(s) present: ${inventory.otherBuilds.map((b) => b.id).join(', ')})` : ''}: leftovers of an earlier build, excluded from the totals`, fix: 'clean the output directory before building (rm -rf .output / .next / dist) so measurements and deployments contain one build' })
  }
  const entryJs = measured.filter((a) => a.entry && a.type === 'js')
  const entryCss = measured.filter((a) => a.entry && a.type === 'css')
  const js = measured.filter((a) => a.type === 'js')
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
  const sharedChunks = js.filter((a) => (a.sharedBy ?? 0) >= 2)
  report.summary = {
    output: toPosix(relative(root, output.dir)), kind: output.kind, files: assets.length, entryJsGzipKb: metrics.entryJsKb ?? 'unknown', entryCssGzipKb: metrics.entryCssKb ?? 'unknown', totalJsGzipKb: metrics.totalJsKb, totalJsRawKb: kb(sum(js, 'raw')), largest: js[0] ? `${js[0].file} (${kb(js[0].gzip)} KB gzip)` : '-', newestAsset: assets.map((a) => a.mtime).sort().pop(),
    assetScope: scoped ? 'manifest' : 'directory', measuredFiles: measured.length, staleFiles: stale.length, unreferencedFiles: unreferenced.length, inventoryComplete: scoped ? Boolean(inventory.complete) : false, staleJsGzipKb: kb(sum(stale.filter((a) => a.type === 'js'), 'gzip')), buildId: inventory?.buildId ?? null, otherBuilds: (inventory?.otherBuilds ?? []).map((b) => b.id), sharedChunks: inventory?.importers ? sharedChunks.length : 'unknown',
  }
  report.data = { metrics, budgets, assets, inventory: inventory ? { source: inventory.source, buildId: inventory.buildId, otherBuilds: inventory.otherBuilds, knownNames: inventory.names.size } : null }
  const sections = [
    { title: 'Budgets (KB gzip)', table: { headers: ['metric', 'value', 'budget', 'status'], rows: budgetRows } },
    { title: `Largest assets (top ${top})`, table: { headers: ['gzip KB', 'raw KB', 'entry', 'scope', 'shared by', 'file'], rows: assets.slice(0, top).map((a) => [kb(a.gzip), kb(a.raw), a.entry ? 'yes' : '', a.scope, a.sharedBy ?? '?', a.file]) } },
  ]
  report.notes.push('gzip level 6 (Node zlib default) approximates CDN compression; Brotli is usually 10-20% smaller.')
  return finish(report, args, { sections })
}

// Set the exit code instead of calling process.exit: large --json outputs piped to another process
// would otherwise be truncated at 64 KiB when the process exits before stdout drains.
if (isMainModule(import.meta.url)) process.exitCode = run(process.argv.slice(2))
