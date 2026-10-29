#!/usr/bin/env node
// Checks the public contracts between modules (features/, modules/, domains/…): every module has
// an explicit entry (index.ts), outsiders import only through it, the module graph has no cycles,
// and, against a saved baseline, no public export disappeared. Read-only unless --write-baseline.
//
// Usage: contracts-check.mjs <project-root> [--modules-dir app/modulos] [--baseline file]
//        [--write-baseline file] [--json|--md] [--fail-on confirmed|any|none]
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readJson, rel as relPath, walk } from './lib/fs.mjs'
import { buildGraph, moduleRootOf } from './lib/graph.mjs'
import { detectProject, excludeArg, loadConfig } from './lib/project.mjs'
import { ENGINE_HELP, addFinding, createReport, engineOptionsFrom, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'

const HELP = `
contracts-check — public entry points, boundary violations, module cycles and breaking changes.

usage: node contracts-check.mjs <project-root> [options]
  --modules-dir <dir>      directory whose children are modules (default: any features|modules|domains|modulos|dominios|slices dir)
  --baseline <file>        JSON written by --write-baseline; removed exports are reported as breaking
  --write-baseline <file>  write the current public surface (the only write this tool performs)
  --exclude <globs>   comma-separated project-relative globs to leave out (also "exclude" in .frontend-audit.json)
  --json | --md            output format
  --fail-on <level>        exit 1 on: confirmed (default) | any | none${ENGINE_HELP}

Findings:
  module-without-entry       other modules import it but it has no index.ts (heuristic)
  internal-import            an outsider imports a file that is not the module's index (confirmed)
  wildcard-public-api        index.ts uses export * (surface not explicit; heuristic, low)
  module-cycle               modules import each other through their entries (confirmed)
  implicit-cross-module-dependency  a module is used through Nuxt auto-imports or auto-registered components (confirmed when Nuxt metadata verifies it, heuristic otherwise)
  breaking-change            a public export in the baseline is gone (confirmed)
  unused-public-export       exported by index.ts but never imported from outside (info)
  reexport-crosses-module    index.ts re-exports a name declared outside its own module (another module or shared
                             code): the barrel publishes code it does not own (info; semantic engine only)
  package-subpath-not-exported  a deep import into a workspace package whose package.json "exports" does not publish
                             that subpath (confirmed; Node and strict bundlers refuse it)
Modules with a package.json (workspace packages) take their entry from "exports" ["."] or "main".
`

const INDEX_NAMES = ['index.ts', 'index.tsx', 'index.js', 'index.mjs', 'index.vue']

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
  const report = createReport('contracts-check', project)
  let graph
  try {
    graph = buildGraph(project, engineOptionsFrom(args))
  } catch (error) {
    return fail(error.message)
  }
  const { files, edges, analysis, symbols, unexportedSubpaths = [] } = graph
  report.analysis = analysis
  /** Entry file declared by a package.json (workspace packages): exports["."] or main/module/types. */
  const packageEntryOf = (m) => {
    const pkg = readJson(join(root, m, 'package.json'))
    if (!pkg) return null
    const pick = (v) => (v == null ? null : typeof v === 'string' ? v : Array.isArray(v) ? pick(v[0]) : pick(v.import ?? v.default ?? v.module ?? v.types ?? null))
    const exp = pkg.exports
    const target = exp == null ? (pkg.module ?? pkg.main ?? pkg.types ?? null) : typeof exp === 'string' || Array.isArray(exp) ? pick(exp) : Object.keys(exp).some((k) => k.startsWith('.')) ? pick(exp['.']) : pick(exp)
    if (!target) return null
    const relFile = `${m}/${target.replace(/^\.\//, '')}`
    for (const c of [relFile, `${relFile}.ts`, `${relFile}.tsx`, `${relFile}.js`, `${relFile}/index.ts`]) if (files.has(c)) return c
    return null
  }

  // Module roots
  const roots = new Set()
  if (args['modules-dir']) {
    const dir = String(args['modules-dir']).replace(/\/$/, '')
    for (const f of walk(join(root, dir), { extensions: null })) {
      const r = relPath(root, f)
      const seg = r.slice(dir.length + 1).split('/')
      if (seg.length > 1) roots.add(`${dir}/${seg[0]}`)
    }
  } else {
    for (const r of files.keys()) {
      const m = moduleRootOf(r)
      if (m) roots.add(m)
    }
  }
  const moduleOf = (rel) => [...roots].find((m) => rel.startsWith(`${m}/`)) ?? null

  const modules = new Map()
  for (const m of [...roots].sort()) {
    let entryKind = 'index'
    let index = INDEX_NAMES.map((i) => `${m}/${i}`).find((i) => files.has(i)) ?? null
    if (!index) {
      const fromPackage = packageEntryOf(m)
      if (fromPackage) {
        index = fromPackage
        entryKind = 'package.json'
      }
    }
    const info = index ? files.get(index) : null
    const exportsList = info ? info.exports.filter((e) => e !== 'default' && e !== '*') : []
    const wildcard = info ? info.exports.includes('*') : false
    modules.set(m, { name: m.split('/').pop(), root: m, index, entryKind, exports: exportsList.sort(), wildcard, consumers: new Set(), consumerModules: new Set(), usedExports: new Set(), internalImports: [], implicit: [], dependsOn: new Set() })
  }
  for (const u of unexportedSubpaths) {
    if (!moduleOf(u.target)) continue
    addFinding(report, { id: 'package-subpath-not-exported', level: 'confirmed', severity: 'high', file: u.file, line: u.line, message: `imports "${u.specifier}": ${u.package} declares an "exports" map that does not publish this subpath (resolved to ${u.target} only because the file exists)`, fix: 'import from the package entry or a published subpath; if the module must be public, add it to "exports"' })
  }

  for (const e of edges) {
    const toModule = moduleOf(e.to)
    if (!toModule) continue
    const fromModule = moduleOf(e.from)
    if (fromModule === toModule) continue
    const mod = modules.get(toModule)
    mod.consumers.add(e.from)
    if (fromModule) {
      mod.consumerModules.add(fromModule)
      modules.get(fromModule).dependsOn.add(toModule)
    }
    if (e.via !== 'import') {
      mod.implicit.push({ from: e.from, line: e.line, to: e.to, name: e.name, via: e.via })
      mod.implicit[mod.implicit.length - 1].confidence = e.confidence
      addFinding(report, { id: 'implicit-cross-module-dependency', level: e.confidence === 'verified' ? 'confirmed' : 'heuristic', severity: 'medium', file: e.from, line: e.line, message: `uses ${e.name} from ${mod.root} through ${e.via === 'component' ? 'component auto-registration' : 'an auto-import'}${e.confidence === 'verified' ? ' (resolved by Nuxt\'s generated metadata)' : ' (inferred lexically)'}: the dependency bypasses ${mod.index ?? 'any public entry'} and is invisible to import rules`, fix: 'move module code out of auto-imported dirs (Nuxt scans only top-level composables/utils and components dirs) and import it explicitly from the module entry' })
      continue
    }
    if ((mod.index && e.to === mod.index) || (e.package && e.exported && e.specifier !== e.package)) {
      // the module entry, or a subpath the package publishes through its "exports" map: both are public
      for (const n of String(e.name).split(',').map((s) => s.trim()).filter(Boolean)) mod.usedExports.add(n)
    } else {
      mod.internalImports.push({ from: e.from, line: e.line, to: e.to, specifier: e.specifier })
      if (mod.index) {
        addFinding(report, { id: 'internal-import', level: e.confidence === 'verified' ? 'confirmed' : 'heuristic', severity: e.kind === 'type' ? 'medium' : 'high', file: e.from, line: e.line, message: `imports ${e.to} directly${e.kind === 'type' ? ' (type-only)' : ''}; the public entry of ${mod.root} is ${mod.index}`, evidence: `${e.specifier ?? ''} resolved by ${e.resolution ?? 'lexical'}`, fix: `re-export from ${mod.index} and import from there; add a dependency-cruiser rule so it cannot regress` })
      }
    }
  }

  // Where does each public name really live? (semantic engine: barrels followed syntactically)
  if (symbols) {
    for (const mod of modules.values()) {
      if (!mod.index) continue
      mod.exportOrigins = {}
      const foreign = new Map() // origin module (or 'outside the modules tree') -> [name (file)]
      for (const name of mod.exports) {
        const o = symbols.resolve(mod.index, name)
        mod.exportOrigins[name] = { status: o.status, file: o.file ?? null, hops: o.hops ?? 0 }
        if (o.status === 'declared' && o.file && moduleOf(o.file) !== mod.root) {
          const owner = moduleOf(o.file) ?? 'outside the modules tree'
          if (!foreign.has(owner)) foreign.set(owner, [])
          foreign.get(owner).push(`${name} (${o.file})`)
        }
      }
      for (const [owner, names] of foreign) {
        addFinding(report, { id: 'reexport-crosses-module', level: 'info', severity: 'low', file: mod.index, message: `${mod.root} publishes ${names.length} name(s) declared ${owner === 'outside the modules tree' ? 'outside the modules tree' : `in module ${owner}`}: ${names.slice(0, 8).join(', ')}${names.length > 8 ? ', …' : ''}`, fix: owner === 'outside the modules tree' ? 'a barrel over files that still live elsewhere is a transition state: move the files under the module, or keep this list as the migration backlog' : 'publish the name from its owner module, or move the declaration; a barrel should re-export only its own files' })
      }
    }
  }

  for (const mod of modules.values()) {
    if (!mod.index && mod.consumers.size) addFinding(report, { id: 'module-without-entry', level: 'heuristic', severity: 'medium', file: mod.root, message: `${mod.consumers.size} outside files import from ${mod.root}, which has no index.ts`, fix: 'add an index.ts that exports the public surface; everything else is private' })
    if (mod.wildcard) addFinding(report, { id: 'wildcard-public-api', level: 'heuristic', severity: 'low', file: mod.index, message: `export * makes the public surface of ${mod.root} implicit`, fix: 'list the exports explicitly so breaking changes are visible in diffs' })
    for (const name of mod.exports) if (!mod.usedExports.has(name) && mod.consumers.size) addFinding(report, { id: 'unused-public-export', level: 'info', severity: 'info', file: mod.index, message: `${name} is public in ${mod.root} but no outside file imports it` })
  }

  // Cycles (direct and through one intermediate)
  const seen = new Set()
  for (const a of modules.values()) for (const b of a.dependsOn) {
    const back = modules.get(b)?.dependsOn.has(a.root)
    const key = [a.root, b].sort().join('<>')
    if (back && !seen.has(key)) {
      seen.add(key)
      addFinding(report, { id: 'module-cycle', level: 'confirmed', severity: 'medium', file: a.root, message: `${a.root} and ${b} import each other`, fix: 'move the shared concept to the module that owns it, or to a third module both depend on' })
    }
  }

  // Baseline comparison
  const surface = Object.fromEntries([...modules.values()].map((m) => [m.root, { index: m.index, exports: m.exports }]))
  if (args.baseline) {
    const base = readJson(resolve(root, String(args.baseline)))
    if (!base?.modules) return fail(`baseline not readable: ${args.baseline}`)
    for (const [mroot, entry] of Object.entries(base.modules)) {
      const now = surface[mroot]
      if (!now) {
        addFinding(report, { id: 'breaking-change', level: 'confirmed', severity: 'high', file: mroot, message: `module ${mroot} from the baseline no longer exists`, fix: 'if intentional, update the baseline and the consumers' })
        continue
      }
      for (const name of entry.exports ?? []) if (!now.exports.includes(name)) addFinding(report, { id: 'breaking-change', level: 'confirmed', severity: 'high', file: now.index ?? mroot, message: `public export "${name}" of ${mroot} was removed or renamed`, fix: 'keep a deprecated alias for one release, migrate consumers, then remove and update the baseline' })
      for (const name of now.exports) if (!(entry.exports ?? []).includes(name)) report.notes.push(`new public export in ${mroot}: ${name}`)
    }
  }
  if (args['write-baseline']) {
    const target = resolve(root, String(args['write-baseline']))
    writeFileSync(target, `${JSON.stringify({ generatedAt: new Date().toISOString(), modules: surface }, null, 2)}\n`)
    report.notes.push(`baseline written to ${target}`)
  }

  report.summary = { modules: modules.size, withEntry: [...modules.values()].filter((m) => m.index).length, internalImports: [...modules.values()].reduce((n, m) => n + m.internalImports.length, 0), publicExports: [...modules.values()].reduce((n, m) => n + m.exports.length, 0) }
  report.data = { modules: [...modules.values()].map((m) => ({ root: m.root, index: m.index, entryKind: m.entryKind, exports: m.exports, usedExports: [...m.usedExports], consumers: [...m.consumers], consumerModules: [...m.consumerModules], dependsOn: [...m.dependsOn], internalImports: m.internalImports, implicit: m.implicit, ...(m.exportOrigins ? { exportOrigins: m.exportOrigins } : {}) })) }
  const sections = [{ title: 'Modules', table: { headers: ['module', 'entry', 'public', 'used', 'consumers', 'depends on', 'internal imports'], rows: [...modules.values()].map((m) => [m.root, m.index ? m.index.split('/').pop() : 'NONE', m.exports.length, m.usedExports.size, m.consumers.size, [...m.dependsOn].map((d) => d.split('/').pop()).join(',') || '-', m.internalImports.length]) } }]
  return finish(report, args, { sections })
}

// Set the exit code instead of calling process.exit: large --json outputs piped to another process
// would otherwise be truncated at 64 KiB when the process exits before stdout drains.
if (isMainModule(import.meta.url)) process.exitCode = run(process.argv.slice(2))
