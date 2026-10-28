// Semantic graph: the same file records and edge shape as the lexical graph (so every tool keeps
// working), with imports, exports, identifiers and template components taken from the compilers'
// ASTs and module specifiers resolved with the project's TypeScript configuration. Each edge says
// how it was resolved and whether it is a runtime or a type-only dependency; what could not be
// resolved is listed, never guessed.
import { statSync } from 'node:fs'
import { readText } from '../fs.mjs'
import { classify, mergedCatalog, sourceFiles } from '../project.mjs'
import { countLines, splitSfc, stripCode, templateExpressions, toPascalCase } from '../source.mjs'
import { createSemanticHost } from './host.mjs'
import { createResolver } from './resolver.mjs'
import { parseModule } from './ts-module.mjs'
import { parseSfc } from './vue-sfc.mjs'
import { resolveCompilerOptions } from './tsconfig.mjs'

export { createSemanticHost }

/** Builds a lexical-compatible file record from the semantic parse of one file. */
function fileRecord(project, f, host, fallbacks) {
  const text = readText(f.abs)
  const isVue = f.rel.endsWith('.vue')
  let parsed = null
  let engine = 'semantic'
  if (isVue) {
    if (host.sfc) {
      parsed = parseSfc(host.sfc, host.ts, text, f.rel)
      if (parsed.error) {
        fallbacks.push({ file: f.rel, reason: parsed.error })
        parsed = null
      }
    } else fallbacks.push({ file: f.rel, reason: 'vue/compiler-sfc unavailable: lexical SFC split' })
    if (!parsed) {
      // lexical split of the SFC, semantic parse of its script block when TypeScript is available
      const sfc = splitSfc(text)
      try {
        const info = parseModule(host.ts, sfc.script, `${f.rel}.${sfc.lang === 'ts' ? 'ts' : 'js'}`, { lang: sfc.lang })
        const offset = sfc.scriptLine - 1
        parsed = { ...info, imports: info.imports.map((i) => ({ ...i, line: i.line + offset })), exports: info.exports.map((e) => ({ ...e, line: e.line + offset })), sfc: null, scriptContent: sfc.script, templateContent: sfc.template, lexicalSfc: sfc }
        engine = 'semantic-script+lexical-template'
      } catch (error) {
        fallbacks.push({ file: f.rel, reason: `script parse failed: ${error?.message ?? error}` })
        parsed = null
      }
    }
  } else {
    try {
      parsed = parseModule(host.ts, text, f.rel)
    } catch (error) {
      fallbacks.push({ file: f.rel, reason: `parse failed: ${error?.message ?? error}` })
    }
  }
  if (!parsed) return null

  const sfc = parsed.sfc
  const lexicalSfc = parsed.lexicalSfc ?? (isVue ? splitSfc(text) : null)
  const code = isVue ? parsed.scriptContent : text
  const template = isVue ? parsed.templateContent : ''
  const stripped = stripCode(code)
  const templateCode = template ? stripCode(templateExpressions(template)) : ''
  const templateIds = sfc ? sfc.templateIdentifiers : new Map()
  const ids = new Set([...parsed.valueIdentifiers.keys(), ...parsed.calls.keys(), ...templateIds.keys()])
  const tags = new Map()
  if (sfc) for (const [tag, lines] of sfc.templateComponents) tags.set(tag.includes('-') ? toPascalCase(tag) : tag, lines)
  else if (lexicalSfc) for (const [tag, lines] of lexicalTags(lexicalSfc.template)) tags.set(tag, lines)
  const legacyImports = parsed.imports.map((i) => ({ kind: i.kind, source: i.source, typeOnly: i.typeOnly, names: i.names.map((n) => n.local).filter((n) => n && n !== '*'), line: i.line }))
  const scriptLine = sfc ? sfc.scriptStartLine || 1 : lexicalSfc ? lexicalSfc.scriptLine : 1
  const templateLine = sfc ? sfc.templateLine : lexicalSfc ? lexicalSfc.templateLine : 0
  const info = {
    rel: f.rel,
    abs: f.abs,
    isVue,
    text,
    lines: countLines(text),
    scriptLines: countLines(code),
    templateLines: isVue ? countLines(template) : 0,
    scriptLine,
    templateLine,
    setup: sfc ? sfc.setup : lexicalSfc ? lexicalSfc.setup : false,
    code,
    stripped,
    template,
    templateCode,
    imports: legacyImports,
    exports: [...new Set(parsed.exports.map((e) => e.name))],
    declared: parsed.declared,
    ids,
    tags,
    classification: classify(project, f.rel),
    unknown: [],
    packageUses: [],
    engine,
    semantic: {
      imports: parsed.imports,
      exports: parsed.exports,
      directives: parsed.directives,
      valueIdentifiers: parsed.valueIdentifiers,
      typeIdentifiers: parsed.typeIdentifiers,
      templateIdentifiers: templateIds,
      calls: parsed.calls,
      memberCalls: parsed.memberCalls,
      jsxTags: parsed.jsxTags,
      sfc: sfc ? { setup: sfc.setup, lang: sfc.lang, props: sfc.props, setupRefs: sfc.setupRefs, setupConsts: sfc.setupConsts, emits: sfc.emits, exposes: sfc.exposes, models: sfc.models, lifecycle: sfc.lifecycle, watchers: sfc.watchers, computed: sfc.computed, templateDepth: sfc.templateDepth, templateElements: sfc.templateElements, templateComponents: [...sfc.templateComponents.keys()], compileError: sfc.compileError } : null,
      clientBoundary: parsed.directives.includes('use client'),
      serverDirective: parsed.directives.includes('use server'),
      importsServerOnly: parsed.imports.some((i) => i.source === 'server-only'),
    },
  }
  info.importedNames = new Set(legacyImports.flatMap((i) => i.names))
  return info
}

function lexicalTags(template) {
  // minimal fallback when compiler-sfc is unavailable: PascalCase or kebab-case tags
  const out = new Map()
  for (const m of template.matchAll(/<([A-Z][\w]*|[a-z][\w]*(?:-[\w]+)+)(?=[\s/>])/g)) {
    const name = m[1].includes('-') ? toPascalCase(m[1]) : m[1]
    if (!out.has(name)) out.set(name, [])
    out.get(name).push(1)
  }
  return out
}

const BUILTIN_COMPOSABLES_FALLBACK = ['useState', 'useFetch', 'useAsyncData', 'useLazyFetch', 'useLazyAsyncData', 'useRoute', 'useRouter', 'useHead', 'useSeoMeta', 'useNuxtApp', 'useRuntimeConfig', 'useAppConfig', 'useCookie', 'useRequestHeaders', 'useRequestEvent', 'useRequestURL', 'useError', 'useId', 'useAttrs', 'useSlots', 'useTemplateRef', 'useCssModule']

/**
 * Semantic graph builder. `builtins`: { composables: Set, components: Set } from the lexical graph
 * module so both engines share one list. Returns the lexical shape plus `analysis`, `unknownImports`
 * and `packageImports`.
 */
export function buildSemanticGraph(project, host, { autoImports = true, builtins } = {}) {
  const BUILTIN_COMPOSABLES = builtins?.composables ?? new Set(BUILTIN_COMPOSABLES_FALLBACK)
  const BUILTIN_COMPONENTS = builtins?.components ?? new Set()
  const started = performance.now()
  const compilerOptions = resolveCompilerOptions(host.ts, project)
  const resolver = createResolver(host.ts, project, compilerOptions)
  const fallbacks = []
  const files = new Map()
  let newestSourceMtime = 0
  for (const f of sourceFiles(project)) {
    const info = fileRecord(project, f, host, fallbacks)
    if (info) files.set(f.rel, info)
    try {
      newestSourceMtime = Math.max(newestSourceMtime, statSync(f.abs).mtimeMs)
    } catch {
      /* ignore */
    }
  }
  const empty = { symbols: new Map(), components: new Map(), collisions: [], packageSymbols: new Map(), packageComponents: new Map(), source: 'none', metadata: { present: false, files: [], mtime: null, stale: [], pathMismatches: [], verifiedSymbols: 0, verifiedComponents: 0, newestSourceMtime: null, olderThanSources: false } }
  const catalog = autoImports ? mergedCatalog(project) : empty
  if (catalog.metadata) {
    catalog.metadata.newestSourceMtime = newestSourceMtime || null
    catalog.metadata.olderThanSources = Boolean(catalog.metadata.present && catalog.metadata.mtime && newestSourceMtime && catalog.metadata.mtime < newestSourceMtime)
  }

  const edges = []
  const unknownImports = []
  const packageImports = new Map()
  const unknownByName = new Map()
  const packageByName = new Map()
  const note = (map, name, kind, file, source) => {
    if (!map.has(name)) map.set(name, { name, kind, source, files: new Set() })
    map.get(name).files.add(file)
  }
  const resolutionCounts = {}

  for (const info of files.values()) {
    for (const imp of info.semantic.imports) {
      const r = resolver.resolve(info.rel, imp.source)
      resolutionCounts[r.method ?? r.status] = (resolutionCounts[r.method ?? r.status] ?? 0) + 1
      const names = imp.names.map((n) => n.local).filter((n) => n && n !== '*').join(', ') || imp.kind
      if (r.status === 'project') {
        if (r.file === info.rel) continue
        edges.push({ from: info.rel, to: r.file, via: 'import', confidence: r.confidence, kind: imp.typeOnly ? 'type' : 'runtime', importKind: imp.kind, resolution: r.method, name: names, line: imp.line, col: imp.col ?? null, typeOnly: imp.typeOnly, specifier: imp.source })
      } else if (r.status === 'package') {
        packageImports.set(r.name, (packageImports.get(r.name) ?? 0) + 1)
      } else if (r.status === 'unknown') {
        unknownImports.push({ file: info.rel, line: imp.line, specifier: imp.source, kind: imp.kind, reason: imp.unresolvedReason ?? r.reason })
      } else if (r.status === 'outside') {
        unknownImports.push({ file: info.rel, line: imp.line, specifier: imp.source, kind: imp.kind, reason: `resolves outside the project: ${r.file}` })
      }
    }
    if (!autoImports) continue
    const resolvedSymbols = new Set()
    const usesName = (name) => info.semantic.valueIdentifiers.has(name) || info.semantic.calls.has(name) || info.semantic.templateIdentifiers.has(name)
    const firstLine = (name) => info.semantic.valueIdentifiers.get(name) ?? info.semantic.calls.get(name)?.[0] ?? info.semantic.templateIdentifiers.get(name) ?? info.scriptLine
    for (const [name, entry] of catalog.symbols) {
      if (entry.file === info.rel || !usesName(name) || info.declared.has(name) || info.importedNames.has(name)) continue
      resolvedSymbols.add(name)
      edges.push({ from: info.rel, to: entry.file, via: 'auto-import', confidence: entry.confidence ?? 'inferred', kind: 'runtime', importKind: 'auto-import', resolution: entry.confidence === 'verified' ? 'nuxt-metadata' : 'lexical-catalog', name, line: firstLine(name), col: null, typeOnly: false, specifier: null, symbolKind: entry.kind })
    }
    for (const [name, lines] of info.semantic.calls) {
      if (!/^use[A-Z]/.test(name) || resolvedSymbols.has(name) || info.declared.has(name) || info.importedNames.has(name) || BUILTIN_COMPOSABLES.has(name) || catalog.symbols.has(name)) continue
      const line = lines[0]
      if (catalog.packageSymbols.has(name)) {
        info.packageUses.push({ name, kind: 'composable', source: catalog.packageSymbols.get(name), line })
        note(packageByName, name, 'composable', info.rel, catalog.packageSymbols.get(name))
      } else {
        info.unknown.push({ name, kind: 'composable', line })
        note(unknownByName, name, 'composable', info.rel)
      }
    }
    for (const [tag, lines] of info.tags) {
      const name = tag.startsWith('Lazy') && !catalog.components.has(tag) ? tag.slice(4) : tag
      if (info.importedNames.has(tag) || info.importedNames.has(name) || info.declared.has(tag)) continue
      const line = lines[0] ?? info.templateLine ?? 1
      const entry = catalog.components.get(name)
      if (entry) {
        if (entry.file !== info.rel) edges.push({ from: info.rel, to: entry.file, via: 'component', confidence: entry.confidence ?? 'inferred', kind: 'runtime', importKind: 'component', resolution: entry.confidence === 'verified' ? 'nuxt-metadata' : 'lexical-catalog', name: tag, line, col: null, typeOnly: false, specifier: null })
        continue
      }
      if (BUILTIN_COMPONENTS.has(name) || BUILTIN_COMPONENTS.has(tag)) continue
      if (catalog.packageComponents.has(name) || catalog.packageComponents.has(tag)) {
        const source = catalog.packageComponents.get(name) ?? catalog.packageComponents.get(tag)
        info.packageUses.push({ name: tag, kind: 'component', source, line })
        note(packageByName, tag, 'component', info.rel, source)
      } else {
        info.unknown.push({ name: tag, kind: 'component', line })
        note(unknownByName, tag, 'component', info.rel)
      }
    }
  }
  const toList = (map) => [...map.values()].map((e) => ({ ...e, files: [...e.files].sort() })).sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name))
  const analysis = {
    engine: 'semantic',
    typescript: host.typescript,
    vueCompiler: host.vueCompiler,
    tsconfig: compilerOptions.summary,
    resolution: resolutionCounts,
    fallbacks,
    filesSemantic: [...files.values()].filter((f) => f.engine === 'semantic').length,
    filesPartial: [...files.values()].filter((f) => f.engine !== 'semantic').length,
    durationMs: Math.round(performance.now() - started),
  }
  return { files, edges, catalog, unknown: toList(unknownByName), packageUses: toList(packageByName), unknownImports, packageImports: [...packageImports.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })), analysis }
}
