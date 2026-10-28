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
import { detectProject, loadConfig } from './lib/project.mjs'
import { addFinding, createReport, fail, finish, parseArgs, usage } from './lib/report.mjs'

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
  --fail-on <level>    exit 1 on: confirmed (default) | any | none

Edge confidence: verified (explicit import, or auto-import/component resolved by Nuxt's own
.nuxt/types/imports.d.ts and .nuxt/components.d.ts), inferred (this tool's lexical re-implementation
of Nuxt's scanning rules). Names that resolve nowhere are listed as unknown and never become edges.

Findings:
  shared-imports-domain      shared/ui/lib code depends on a business domain (confirmed when verified)
  shell-depends-on-domain    layouts, middleware, plugins or app.vue use domain code
  feature-internal-import    cross-module import that bypasses the module's index.ts
  cross-domain-hotspot       one file used by three or more other domains
  domain-cycle               two domains depend on each other
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
  const { files, edges, catalog, unknown, packageUses } = buildGraph(project, { autoImports: !args['no-auto-imports'] })
  const top = Number(args.top ?? 10)
  if (args['suggest-config']) {
    process.stdout.write(`${JSON.stringify(suggestConfig(project, files), null, 2)}\n`)
    return 0
  }
  const coreDomains = new Set(config.coreDomains ?? [])

  const cls = (rel) => files.get(rel)?.classification ?? { domain: 'other', kind: 'other', classified: false }
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
    if (from.kind === 'shared') {
      addFinding(report, {
        id: 'shared-imports-domain', level: e.confidence === 'verified' ? 'confirmed' : 'heuristic', severity: 'high', file: e.from, line: e.line,
        message: `shared code uses domain "${to.domain}" (${e.via} ${e.name}, ${e.confidence}) from ${e.to}`,
        fix: 'Move the domain-specific part into the domain, or move this shared piece into the domain that owns it.',
      })
    } else if (from.kind === 'shell' && !coreDomains.has(to.domain)) {
      addFinding(report, {
        id: 'shell-depends-on-domain', level: e.confidence === 'verified' ? 'confirmed' : 'heuristic', severity: 'medium', file: e.from, line: e.line,
        message: `shell depends on domain "${to.domain}" (${e.via} ${e.name}, ${e.confidence}) from ${e.to}`,
        fix: 'Shell (layouts, middleware, plugins) should depend only on a core/session layer; expose what it needs through a domain-free contract.',
      })
    }
    if (e.via === 'import' && from.domain !== to.domain) {
      const moduleRoot = moduleRootOf(e.to)
      if (moduleRoot) {
        const index = ['index.ts', 'index.tsx', 'index.js', 'index.mjs'].map((i) => `${moduleRoot}/${i}`).find((i) => files.has(i))
        if (index && e.to !== index && !e.to.startsWith(`${moduleRoot}/index.`)) {
          addFinding(report, {
            id: 'feature-internal-import', level: 'confirmed', severity: 'high', file: e.from, line: e.line,
            message: `imports "${e.specifier}" (internal of module ${moduleRoot}) instead of its public ${index}`,
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

  // Cycles between business domains
  const seenCycle = new Set()
  for (const p of pairs) {
    const back = pairs.find((q) => q.from === p.to && q.to === p.from)
    const key = [p.from, p.to].sort().join('<>')
    if (back && !seenCycle.has(key)) {
      seenCycle.add(key)
      addFinding(report, {
        id: 'domain-cycle', level: 'heuristic', severity: 'medium',
        message: `domains "${p.from}" and "${p.to}" depend on each other (${p.edges} and ${back.edges} edges)`,
        fix: 'Decide which one owns the shared concept, or extract it into a third module both depend on.',
      })
    }
  }

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
  report.summary = {
    files: files.size,
    edges: edges.length,
    edgesByKind: viaCounts,
    edgesByConfidence: confidenceCounts,
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
  if (args.edges) {
    const [a, b] = String(args.edges).split(':')
    const list = edges.filter((e) => domainOf(e.from) === a && domainOf(e.to) === b)
    sections.push({ title: `Edges ${a} → ${b} (${list.length})`, table: { headers: ['from', 'line', 'via', 'confidence', 'name', 'to'], rows: list.map((e) => [e.from, e.line, e.via, e.confidence, e.name, e.to]) } })
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
    edges: edges.map((e) => ({ from: e.from, to: e.to, via: e.via, confidence: e.confidence, name: e.name, line: e.line, typeOnly: e.typeOnly, fromDomain: domainOf(e.from), toDomain: domainOf(e.to) })),
  }
  return finish(report, args, { sections })
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
