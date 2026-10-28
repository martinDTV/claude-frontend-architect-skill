#!/usr/bin/env node
// Domain dependency graph for Nuxt/Vue and Next.js/React projects, including the edges that
// dependency-cruiser cannot see in Nuxt: auto-imported composables, utils and stores, and
// components used in templates. Read-only.
//
// Usage: domain-deps.mjs <project-root> [--config .frontend-audit.json] [--json|--md]
//        [--top 10] [--edges crm:obra] [--no-auto-imports] [--fail-on confirmed|any|none]
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildGraph, moduleRootOf } from './lib/graph.mjs'
import { classify, detectProject, loadConfig } from './lib/project.mjs'
import { ENGINE_HELP, addFinding, createReport, engineOptionsFrom, fail, finish, parseArgs, usage } from './lib/report.mjs'

const HELP = `
domain-deps — dependency matrix between business domains, with Nuxt auto-imports resolved.

usage: node domain-deps.mjs <project-root> [options]
  --config <file>      classification file (default: .frontend-audit.json at the root)
  --top <n>            domain pairs and hotspots to print (default 10)
  --edges <a:b>        list every edge from domain a to domain b
  --no-auto-imports    explicit imports and template components only
  --include-tests      include test files in the graph
  --suggest-config     print a starter .frontend-audit.json built from the folders found
  --json | --md        machine-readable or Markdown output (default: text)
  --fail-on <level>    exit 1 on: confirmed (default) | any | none${ENGINE_HELP}

Engines: the semantic engine parses TypeScript, JavaScript and TSX with the project's own TypeScript
compiler (syntax only, nothing executed) and .vue files with the project's vue/compiler-sfc, and
resolves specifiers with the project's tsconfig (paths, baseUrl, Nuxt's .nuxt/tsconfig.app.json).
Every edge then says how it was resolved (typescript, tsconfig-paths, relative, nuxt-metadata,
lexical-catalog, lexical-fallback) and whether it is a runtime or a type-only dependency. The
lexical engine is the v1.1 regex analysis and remains the fallback.

Edge confidence: verified (explicit import, or auto-import/component resolved by Nuxt's own
.nuxt/types/imports.d.ts and .nuxt/components.d.ts), inferred (this tool's lexical re-implementation
of Nuxt's scanning rules). Names that resolve nowhere are listed as unknown and never become edges.

Findings:
  shared-imports-domain      shared/ui/lib code depends on a business domain (confirmed when verified)
  shell-depends-on-domain    layouts, middleware, plugins or app.vue use domain code
  feature-internal-import    cross-module import that bypasses the module's index.ts
  cross-domain-hotspot       one file used by three or more other domains
  domain-cycle               two domains depend on each other through runtime imports (type-only cycles are a note)
  unresolved-import          an import specifier the engine could not resolve to a file or a package (info)
  server-only-in-client      Next.js: a 'use client' module imports (directly or transitively) a module marked
                             'server-only' (confirmed)
  server-env-in-client       Next.js: a 'use client' module reads a non-NEXT_PUBLIC env variable (heuristic)
Type-only imports (import type, type specifiers) are compile-time coupling: they lower the severity
of boundary findings and never create runtime cycles.
Config keys (.frontend-audit.json): domains {name: [globs]}, shell [globs], shared [globs],
coreDomains [names the shell may depend on], publicRoutes, excludeTests.
Inferred edges are lexical: verify before acting. Run 'nuxt prepare' to get verified ones.
`

export function run(argv) {
  const args = parseArgs(argv, { booleans: ['no-auto-imports', 'include-tests', 'suggest-config'] })
  if (args.help || !args._[0]) return usage(HELP)
  const root = resolve(args._[0])
  if (!existsSync(join(root, 'package.json'))) return fail(`no package.json in ${root}`)
  const config = loadConfig(root, args.config)
  if (args['include-tests']) config.excludeTests = false
  const project = detectProject(root, config)
  const report = createReport('domain-deps', project)
  let graph
  try {
    graph = buildGraph(project, { autoImports: !args['no-auto-imports'], ...engineOptionsFrom(args) })
  } catch (error) {
    return fail(error.message)
  }
  const { files, edges, catalog, unknown, packageUses, unknownImports = [], packageImports = [], analysis } = graph
  report.analysis = analysis
  const isType = (e) => e.kind === 'type'
  const top = Number(args.top ?? 10)
  if (args['suggest-config']) {
    process.stdout.write(`${JSON.stringify(suggestConfig(project, files), null, 2)}\n`)
    return 0
  }
  const coreDomains = new Set(config.coreDomains ?? [])

  // edge targets outside the scanned sources (declaration files, generated code) are classified by the same rules
  const cls = (rel) => files.get(rel)?.classification ?? classify(project, rel)
  const domainOf = (rel) => cls(rel).domain

  // Matrix of distinct target files per (from domain, to domain)
  const matrix = new Map()
  const pairFiles = new Map()
  for (const e of edges) {
    const a = domainOf(e.from)
    const b = domainOf(e.to)
    if (!matrix.has(a)) matrix.set(a, new Map())
    const row = matrix.get(a)
    if (!row.has(b)) row.set(b, new Set())
    row.get(b).add(e.to)
    const key = `${a}>${b}`
    if (!pairFiles.has(key)) pairFiles.set(key, new Map())
    const targets = pairFiles.get(key)
    if (!targets.has(e.to)) targets.set(e.to, { count: 0, via: new Set(), confidence: new Set(), names: new Set(), sources: new Set() })
    const t = targets.get(e.to)
    t.count++
    t.via.add(e.via)
    t.confidence.add(e.confidence)
    if (e.name) t.names.add(e.name)
    t.sources.add(e.from)
  }

  const domains = [...new Set([...files.values()].map((f) => f.classification.domain))].sort((a, b) => {
    const order = (d) => (d === 'shell' ? 0 : d === 'shared' ? 1 : d === 'server' ? 3 : d === 'other' ? 4 : 2)
    return order(a) - order(b) || a.localeCompare(b)
  })
  const business = domains.filter((d) => [...files.values()].some((f) => f.classification.domain === d && f.classification.kind === 'domain'))

  // Horizontal pairs: business domain -> different business domain
  const pairs = []
  for (const a of business) for (const b of business) {
    if (a === b) continue
    const targets = pairFiles.get(`${a}>${b}`)
    if (!targets) continue
    const edgeCount = [...targets.values()].reduce((n, t) => n + t.count, 0)
    pairs.push({ from: a, to: b, files: targets.size, edges: edgeCount, targets: [...targets.entries()].sort((x, y) => y[1].count - x[1].count) })
  }
  pairs.sort((x, y) => y.edges - x.edges)

  // Findings
  for (const e of edges) {
    const from = cls(e.from)
    const to = cls(e.to)
    if (to.kind !== 'domain') continue
    const typeNote = isType(e) ? ', type-only import: compile-time coupling' : ''
    if (from.kind === 'shared') {
      addFinding(report, {
        id: 'shared-imports-domain', level: e.confidence === 'verified' ? 'confirmed' : 'heuristic', severity: isType(e) ? 'low' : 'high', file: e.from, line: e.line,
        message: `shared code uses domain "${to.domain}" (${e.via} ${e.name}, ${e.confidence}${typeNote}) from ${e.to}`,
        fix: 'Move the domain-specific part into the domain, or move this shared piece into the domain that owns it.',
      })
    } else if (from.kind === 'shell' && !coreDomains.has(to.domain)) {
      addFinding(report, {
        id: 'shell-depends-on-domain', level: e.confidence === 'verified' ? 'confirmed' : 'heuristic', severity: isType(e) ? 'low' : 'medium', file: e.from, line: e.line,
        message: `shell depends on domain "${to.domain}" (${e.via} ${e.name}, ${e.confidence}${typeNote}) from ${e.to}`,
        fix: 'Shell (layouts, middleware, plugins) should depend only on a core/session layer; expose what it needs through a domain-free contract.',
      })
    }
    if (e.via === 'import' && from.domain !== to.domain) {
      const moduleRoot = moduleRootOf(e.to)
      if (moduleRoot) {
        const index = ['index.ts', 'index.tsx', 'index.js', 'index.mjs'].map((i) => `${moduleRoot}/${i}`).find((i) => files.has(i))
        if (index && e.to !== index && !e.to.startsWith(`${moduleRoot}/index.`)) {
          addFinding(report, {
            id: 'feature-internal-import', level: e.confidence === 'verified' ? 'confirmed' : 'heuristic', severity: isType(e) ? 'medium' : 'high', file: e.from, line: e.line,
            message: `imports "${e.specifier}" (internal of module ${moduleRoot}${isType(e) ? ', type-only' : ''}, resolved by ${e.resolution ?? 'lexical'}) instead of its public ${index}`,
            fix: `Export what is needed from ${index} and import from there; enforce with dependency-cruiser or eslint-plugin-boundaries.`,
          })
        }
      }
    }
  }

  // Hotspots: files used by >= 3 other business domains
  const usedBy = new Map()
  for (const e of edges) {
    const a = domainOf(e.from)
    const b = domainOf(e.to)
    if (a === b || cls(e.from).kind !== 'domain') continue
    if (!usedBy.has(e.to)) usedBy.set(e.to, new Set())
    usedBy.get(e.to).add(a)
  }
  const hotspots = [...usedBy.entries()].map(([file, set]) => ({ file, domain: domainOf(file), kind: cls(file).kind, domains: [...set].sort() })).filter((h) => h.domains.length >= 3).sort((x, y) => y.domains.length - x.domains.length)
  for (const h of hotspots.slice(0, top)) {
    if (h.kind === 'shared') continue
    addFinding(report, {
      id: 'cross-domain-hotspot', level: 'heuristic', severity: 'medium', file: h.file,
      message: `${h.file} (domain "${h.domain}") is used by ${h.domains.length} other domains: ${h.domains.join(', ')}`,
      fix: 'Either it is core/shared code with a domain name (move and rename it), or a domain contract that should be published through an explicit public entry.',
    })
  }

  // Cycles between business domains: runtime edges only (type-only cycles cost nothing at runtime)
  const runtimePairCount = new Map()
  const runtimeVerified = new Map()
  for (const e of edges) {
    if (isType(e)) continue
    const a = domainOf(e.from)
    const b = domainOf(e.to)
    if (a === b || !business.includes(a) || !business.includes(b)) continue
    const key = `${a}>${b}`
    runtimePairCount.set(key, (runtimePairCount.get(key) ?? 0) + 1)
    if (e.confidence === 'verified') runtimeVerified.set(key, true)
  }
  const seenCycle = new Set()
  const typeOnlyCycles = []
  for (const p of pairs) {
    const key = [p.from, p.to].sort().join('<>')
    if (seenCycle.has(key)) continue
    const back = pairs.find((q) => q.from === p.to && q.to === p.from)
    if (!back) continue
    seenCycle.add(key)
    const fwd = runtimePairCount.get(`${p.from}>${p.to}`) ?? 0
    const rev = runtimePairCount.get(`${p.to}>${p.from}`) ?? 0
    if (fwd && rev) {
      const verifiedBoth = runtimeVerified.get(`${p.from}>${p.to}`) && runtimeVerified.get(`${p.to}>${p.from}`)
      addFinding(report, {
        id: 'domain-cycle', level: verifiedBoth && analysis?.engine === 'semantic' ? 'confirmed' : 'heuristic', severity: 'medium',
        message: `domains "${p.from}" and "${p.to}" depend on each other at runtime (${fwd} and ${rev} runtime edges)`,
        fix: 'Decide which one owns the shared concept, or extract it into a third module both depend on.',
      })
    } else typeOnlyCycles.push(`${p.from} <> ${p.to}`)
  }
  if (typeOnlyCycles.length) report.notes.push(`${typeOnlyCycles.length} domain pair(s) reference each other only through type-only imports (no runtime cycle): ${typeOnlyCycles.slice(0, 5).join(', ')}.`)

  // Next.js / React: server-only code reachable from client modules
  if (project.framework === 'next' || project.framework === 'react') {
    const importsServerOnly = (info) => info.semantic ? info.semantic.importsServerOnly : info.imports.some((i) => i.source === 'server-only')
    const isClient = (info) => info.semantic ? info.semantic.clientBoundary : /^\s*['"]use client['"]/.test(info.code)
    const serverOnly = new Map() // file -> path of files proving it
    for (const info of files.values()) if (importsServerOnly(info)) serverOnly.set(info.rel, [info.rel])
    const runtimeOut = new Map()
    for (const e of edges) {
      if (isType(e) || e.via !== 'import') continue
      if (!runtimeOut.has(e.from)) runtimeOut.set(e.from, [])
      runtimeOut.get(e.from).push(e)
    }
    let changed = true
    let rounds = 0
    while (changed && rounds++ < 50) {
      changed = false
      for (const [from, outs] of runtimeOut) {
        if (serverOnly.has(from)) continue
        // a 'use client' module is a boundary: it is reported below, it never becomes "server-only" itself
        const fromInfo = files.get(from)
        if (fromInfo && isClient(fromInfo)) continue
        const hit = outs.find((e) => serverOnly.has(e.to))
        if (hit) {
          serverOnly.set(from, [from, ...serverOnly.get(hit.to)])
          changed = true
        }
      }
    }
    for (const info of files.values()) {
      if (!isClient(info)) continue
      for (const e of runtimeOut.get(info.rel) ?? []) {
        if (!serverOnly.has(e.to)) continue
        const chain = serverOnly.get(e.to)
        addFinding(report, {
          id: 'server-only-in-client', level: e.confidence === 'verified' ? 'confirmed' : 'heuristic', severity: 'high', file: info.rel, line: e.line,
          message: `'use client' module imports ${e.to}${chain.length > 1 ? `, which reaches a 'server-only' module through ${chain.slice(1).join(' → ')}` : ", which is marked 'server-only'"}`,
          evidence: `import ${e.name} from "${e.specifier}" (${e.resolution ?? 'lexical'})`,
          fix: 'keep the server-only module behind a Server Component or a Server Function; expose a client-safe entry (index.ts) separate from server.ts',
        })
      }
      for (const m of info.stripped.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
        if (m[1].startsWith('NEXT_PUBLIC_') || m[1] === 'NODE_ENV') continue
        addFinding(report, { id: 'server-env-in-client', level: 'heuristic', severity: 'medium', file: info.rel, line: lineOfIndex(info.stripped, m.index) + (info.isVue ? info.scriptLine - 1 : 0), message: `'use client' module reads process.env.${m[1]}: in the browser bundle it is undefined or, if inlined, public`, fix: 'read private env on the server only; pass derived values as props or use NEXT_PUBLIC_ for values that are public by design' })
      }
    }
    for (const info of files.values()) {
      if (!isClient(info)) continue
      for (const e of runtimeOut.get(info.rel) ?? []) {
        const target = files.get(e.to)
        if (!target || serverOnly.has(e.to) || (target.semantic ? target.semantic.clientBoundary : false)) continue
        for (const m of target.stripped.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
          if (m[1].startsWith('NEXT_PUBLIC_') || m[1] === 'NODE_ENV') continue
          addFinding(report, { id: 'server-env-in-client', level: 'heuristic', severity: 'medium', file: info.rel, line: e.line, message: `'use client' module imports ${e.to}, which reads process.env.${m[1]} (line ${lineOfIndex(target.stripped, m.index)}): the value is undefined in the browser or public if inlined`, fix: 'mark that module server-only or move the env read behind a Server Component / Server Function' })
          break
        }
      }
    }
  }

  // Imports the engine could not resolve (environment or real defects: read before acting)
  for (const u of unknownImports.slice(0, 30)) {
    addFinding(report, { id: 'unresolved-import', level: 'info', severity: 'low', file: u.file, line: u.line, message: `${u.kind} import ${u.specifier ? `"${u.specifier}"` : '(non-literal specifier)'} could not be resolved (${u.reason})`, fix: 'a missing file is a defect; a bare specifier with no node_modules means dependencies are not installed; a non-literal dynamic import cannot be traced statically' })
  }
  if (unknownImports.length > 30) report.notes.push(`${unknownImports.length} unresolved imports in total; 30 listed.`)

  const unclassified = [...files.values()].filter((f) => !f.classification.classified && f.classification.kind !== 'test').map((f) => f.rel)
  if (unclassified.length) {
    addFinding(report, {
      id: 'unclassified-files', level: 'info', severity: 'info',
      message: `${unclassified.length} files could not be assigned to a domain by convention (counted as "shared"/"other"); add them to ${config.file ?? '.frontend-audit.json'} for an exact matrix`,
      evidence: unclassified.slice(0, 15).join(', ') + (unclassified.length > 15 ? ', …' : ''),
    })
  }
  for (const c of catalog.collisions.slice(0, 20)) {
    addFinding(report, { id: 'auto-import-collision', level: 'info', severity: 'low', file: c.files[1], message: `auto-import name "${c.name}" is produced by two files: ${c.files.join(' and ')} (the later one wins silently)` })
  }

  const viaCounts = edges.reduce((acc, e) => ((acc[e.via] = (acc[e.via] ?? 0) + 1), acc), {})
  const confidenceCounts = edges.reduce((acc, e) => ((acc[e.confidence] = (acc[e.confidence] ?? 0) + 1), acc), {})
  const meta = catalog.metadata ?? { present: false, stale: [], pathMismatches: [] }
  const metadataState = !project.nuxt ? 'n/a' : !meta.present ? 'absent' : meta.olderThanSources ? 'stale' : 'present'
  if (project.nuxt && args['no-auto-imports'] !== true) {
    if (!meta.present) report.notes.push('No .nuxt/types/imports.d.ts or .nuxt/components.d.ts found: auto-import and component edges are inferred from this tool\'s re-implementation of Nuxt\'s scanning rules. Run `nuxt prepare` in the project to get Nuxt-verified edges.')
    else {
      report.notes.push(`Auto-imports resolved against Nuxt's generated metadata (${meta.files.join(', ')}): ${meta.verifiedSymbols} symbols and ${meta.verifiedComponents} components verified; lexical-only entries are inferred.`)
      if (meta.olderThanSources) report.notes.push('The generated metadata is older than the newest source file: run `nuxt prepare` to refresh it before trusting verified edges for recently added files.')
      if (meta.stale.length) report.notes.push(`${meta.stale.length} metadata entries point at files that no longer exist and were ignored (e.g. ${meta.stale.slice(0, 3).map((x) => x.name).join(', ')}).`)
      if (meta.pathMismatches.length) report.notes.push(`${meta.pathMismatches.length} names resolve to different files in the metadata and in the lexical scan; the metadata wins (e.g. ${meta.pathMismatches.slice(0, 2).map((x) => `${x.name}: ${x.metadata} vs ${x.lexical}`).join('; ')}).`)
    }
    if (unknown.length) report.notes.push(`${unknown.length} composable or component names could not be resolved to a project file or a package (unknown): no edges were created for them; see the unknown-symbols section.`)
  }
  const dependencyKinds = edges.reduce((acc, e) => ((acc[e.kind ?? 'runtime'] = (acc[e.kind ?? 'runtime'] ?? 0) + 1), acc), {})
  const resolutionCounts = edges.reduce((acc, e) => ((acc[e.resolution ?? 'lexical'] = (acc[e.resolution ?? 'lexical'] ?? 0) + 1), acc), {})
  report.summary = {
    engine: analysis?.engine ?? 'lexical',
    files: files.size,
    edges: edges.length,
    edgesByKind: viaCounts,
    edgesByDependencyKind: dependencyKinds,
    edgesByResolution: resolutionCounts,
    edgesByConfidence: confidenceCounts,
    unresolvedImports: unknownImports.length,
    packagesImported: packageImports.length,
    catalogSource: catalog.source,
    metadata: metadataState,
    autoImportSymbols: catalog.symbols.size,
    autoImportComponents: catalog.components.size,
    unknownSymbols: unknown.length,
    packageSymbolsUsed: packageUses.length,
    domains: business.length,
    horizontalEdges: pairs.reduce((n, p) => n + p.edges, 0),
    unclassifiedFiles: unclassified.length,
  }
  if (project.nuxt) report.summary.ssr = project.nuxt.ssr

  const weight = (d) => domains.reduce((n, o) => n + (matrix.get(d)?.get(o)?.size ?? 0) + (matrix.get(o)?.get(d)?.size ?? 0), 0)
  const shown = domains.length > 14 ? [...domains].sort((a, b) => weight(b) - weight(a)).slice(0, 14).sort((a, b) => domains.indexOf(a) - domains.indexOf(b)) : domains
  const matrixRows = shown.map((a) => [a, ...shown.map((b) => matrix.get(a)?.get(b)?.size ?? 0)])
  const sections = [
    {
      title: `Matrix (rows depend on columns; distinct target files${shown.length < domains.length ? `; ${shown.length} of ${domains.length} domains shown, full matrix in --json/--md` : ''})`,
      table: { headers: ['from \\ to', ...shown], rows: matrixRows },
    },
    {
      title: `Horizontal coupling between business domains (top ${top})`,
      table: {
        headers: ['from', 'to', 'edges', 'files', 'main targets'],
        rows: pairs.slice(0, top).map((p) => [p.from, p.to, p.edges, p.files, p.targets.slice(0, 3).map(([f, t]) => `${f} (${t.count}, ${[...t.via].join('/')}, ${[...t.confidence].join('/')})`).join('; ')]),
      },
    },
  ]
  if (hotspots.length) sections.push({ title: 'Hotspots (files used by 3+ other domains)', table: { headers: ['file', 'domain', 'used by'], rows: hotspots.slice(0, top).map((h) => [h.file, h.domain, h.domains.join(', ')]) } })
  if (analysis) {
    const rows = [['engine', `${analysis.engine}${analysis.requested && analysis.requested !== analysis.engine ? ` (requested ${analysis.requested})` : ''}`]]
    if (analysis.typescript?.version) rows.push(['typescript', `${analysis.typescript.version} (${analysis.typescript.source}, ${analysis.typescript.path ?? ''})`])
    else if (analysis.typescript?.reason) rows.push(['typescript', analysis.typescript.reason])
    if (analysis.vueCompiler?.version) rows.push(['vue/compiler-sfc', `${analysis.vueCompiler.version} (${analysis.vueCompiler.source})`])
    else if (analysis.vueCompiler?.reason) rows.push(['vue/compiler-sfc', analysis.vueCompiler.reason])
    if (analysis.tsconfig) rows.push(['tsconfig', Object.entries(analysis.tsconfig).filter(([, v]) => v).map(([k, v]) => `${k}: ${v.file} (${v.paths} paths)`).join('; ') || 'none found'])
    if (analysis.resolution) rows.push(['resolution', Object.entries(analysis.resolution).map(([k, v]) => `${k} ${v}`).join(', ')])
    if (analysis.fallbacks?.length) rows.push(['fallbacks', `${analysis.fallbacks.length} file(s): ${analysis.fallbacks.slice(0, 3).map((f) => `${f.file} (${f.reason})`).join('; ')}`])
    if (analysis.engine === 'lexical' && analysis.reason) rows.push(['why lexical', analysis.reason])
    sections.unshift({ title: 'Analysis', table: { headers: ['aspect', 'value'], rows } })
  }
  if (args.edges) {
    const [a, b] = String(args.edges).split(':')
    const list = edges.filter((e) => domainOf(e.from) === a && domainOf(e.to) === b)
    sections.push({ title: `Edges ${a} → ${b} (${list.length})`, table: { headers: ['from', 'line', 'via', 'kind', 'resolution', 'confidence', 'name', 'to'], rows: list.map((e) => [e.from, e.line, e.via, e.kind ?? 'runtime', e.resolution ?? 'lexical', e.confidence, e.name, e.to]) } })
  }
  if (unknownImports.length) {
    sections.push({ title: `Unresolved imports (${unknownImports.length}, top ${top})`, text: 'Specifiers the engine could not map to a project file or a package. Missing files are defects; bare specifiers without node_modules mean dependencies are not installed; non-literal dynamic imports cannot be traced statically.', table: { headers: ['file', 'line', 'kind', 'specifier', 'reason'], rows: unknownImports.slice(0, top).map((u) => [u.file, u.line, u.kind, u.specifier ?? '(non-literal)', u.reason]) } })
  }
  if (unknown.length || packageUses.length) {
    sections.push({
      title: `Unknown and package-provided symbols (top ${top})`,
      text: 'unknown = looks auto-importable but resolves to no project file or package (typo, missing module, or metadata not generated); package = provided by a dependency according to Nuxt metadata. Neither creates an edge.',
      table: { headers: ['status', 'kind', 'name', 'source', 'files'], rows: [...unknown.slice(0, top).map((u) => ['unknown', u.kind, u.name, '-', u.files.length]), ...packageUses.slice(0, top).map((u) => ['package', u.kind, u.name, u.source, u.files.length])] },
    })
  }

  report.data = {
    domains,
    businessDomains: business,
    matrix: Object.fromEntries(domains.map((a) => [a, Object.fromEntries(domains.map((b) => [b, matrix.get(a)?.get(b)?.size ?? 0]))])),
    pairs: pairs.map((p) => ({ from: p.from, to: p.to, edges: p.edges, files: p.files, targets: p.targets.map(([f, t]) => ({ file: f, count: t.count, via: [...t.via], confidence: [...t.confidence], names: [...t.names].slice(0, 12), sources: [...t.sources] })) })),
    hotspots,
    unclassified,
    collisions: catalog.collisions,
    catalog: { source: catalog.source, metadata: catalog.metadata ? { ...catalog.metadata, stale: catalog.metadata.stale.slice(0, 50) } : null },
    unknown,
    packageUses,
    unknownImports,
    packageImports,
    analysis,
    edges: edges.map((e) => ({ from: e.from, to: e.to, via: e.via, kind: e.kind ?? 'runtime', resolution: e.resolution ?? 'lexical', importKind: e.importKind ?? e.via, confidence: e.confidence, name: e.name, line: e.line, col: e.col ?? null, typeOnly: e.typeOnly, specifier: e.specifier ?? null, fromDomain: domainOf(e.from), toDomain: domainOf(e.to) })),
  }
  return finish(report, args, { sections })
}

function lineOfIndex(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++
  return line
}

/** Starter config: one entry per folder-derived domain plus the unclassified files to assign. */
function suggestConfig(project, files) {
  const domains = {}
  const unclassified = []
  for (const f of files.values()) {
    const c = f.classification
    if (c.kind === 'domain') {
      const dir = f.rel.split('/').slice(0, -1).join('/')
      const key = c.domain
      domains[key] ??= new Set()
      domains[key].add(`${dir}/**`)
    } else if (!c.classified && c.kind !== 'test') unclassified.push(f.rel)
  }
  return {
    _comment: 'Group the folder globs below into real business domains (merge pages/x, components/x and the composables that serve them), then move each unclassified file into a domain, shell or shared.',
    domains: Object.fromEntries(Object.entries(domains).sort().map(([k, v]) => [k, [...v].sort()])),
    shell: [`${project.srcDir === '.' ? '' : `${project.srcDir}/`}layouts/**`, `${project.srcDir === '.' ? '' : `${project.srcDir}/`}middleware/**`, `${project.srcDir === '.' ? '' : `${project.srcDir}/`}plugins/**`],
    shared: [],
    coreDomains: project.config.coreDomains,
    publicRoutes: [],
    unclassified,
  }
}

// Set the exit code instead of calling process.exit: large --json outputs piped to another process
// would otherwise be truncated at 64 KiB when the process exits before stdout drains.
if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = run(process.argv.slice(2))
