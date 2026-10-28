// Builds the file graph: explicit imports, Nuxt auto-import symbol uses and template component
// uses. Shared by domain-deps, state-audit, routes-audit and contracts-check.
//
// Every edge carries a confidence:
//   verified  explicit import resolved to an existing file, or an auto-import / component that
//             Nuxt's own generated metadata (.nuxt/types/imports.d.ts, .nuxt/components.d.ts) maps
//             to that file;
//   inferred  resolved only by this tool's re-implementation of Nuxt's scanning rules.
// Symbols that look auto-importable but resolve nowhere are reported as unknown (or as
// package-provided when the metadata says so); they never become edges.
import { statSync } from 'node:fs'
import { readText } from './fs.mjs'
import { classify, mergedCatalog, resolveImport, sourceFiles } from './project.mjs'
import {
  countLines, declaredNames, extractExports, extractImports, findIdentifier, identifiers, splitSfc, stripCode,
  templateExpressions, templateTags,
} from './source.mjs'

/** Composables provided by Nuxt/Vue themselves: never unknown, never project edges. */
export const BUILTIN_COMPOSABLES = new Set(['useState', 'useFetch', 'useAsyncData', 'useLazyFetch', 'useLazyAsyncData', 'useRoute', 'useRouter', 'useHead', 'useSeoMeta', 'useServerSeoMeta', 'useNuxtApp', 'useRuntimeConfig', 'useAppConfig', 'useCookie', 'useRequestHeaders', 'useRequestHeader', 'useRequestEvent', 'useRequestURL', 'useRequestFetch', 'useError', 'useId', 'useAttrs', 'useSlots', 'useTemplateRef', 'useCssModule', 'useNuxtData', 'useLoadingIndicator', 'useHydration', 'useRouteAnnouncer', 'usePreviewMode', 'useScript', 'useColorMode', 'useToast', 'useOverlay', 'useModel', 'useLink', 'useResponseHeader', 'useHeadSafe', 'useRuntimeHook', 'useNuxtDevTools'])

/** Components provided by Nuxt/Vue themselves. */
export const BUILTIN_COMPONENTS = new Set(['NuxtPage', 'NuxtLayout', 'NuxtLink', 'NuxtLinkLocale', 'NuxtImg', 'NuxtPicture', 'NuxtErrorBoundary', 'NuxtLoadingIndicator', 'NuxtIsland', 'NuxtRouteAnnouncer', 'NuxtWelcome', 'NuxtClientFallback', 'NuxtTime', 'ClientOnly', 'DevOnly', 'ServerPlaceholder', 'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense', 'Component', 'Slot', 'RouterLink', 'RouterView', 'Head', 'Html', 'Body', 'Title', 'Meta', 'Link', 'Style', 'Script', 'Base', 'Noscript'])

/** Parses one source file into the pieces the audits need. */
export function analyzeFile(project, { abs, rel }) {
  const text = readText(abs)
  const isVue = rel.endsWith('.vue')
  const sfc = isVue ? splitSfc(text) : null
  const code = isVue ? sfc.script : text
  const stripped = stripCode(code)
  const template = isVue ? sfc.template : ''
  const templateCode = template ? stripCode(templateExpressions(template)) : ''
  const info = {
    rel,
    abs,
    isVue,
    text,
    lines: countLines(text),
    scriptLines: isVue ? countLines(code) : countLines(text),
    templateLines: isVue ? countLines(template) : 0,
    scriptLine: isVue ? sfc.scriptLine : 1,
    templateLine: isVue ? sfc.templateLine : 0,
    setup: isVue ? sfc.setup : false,
    code,
    stripped,
    template,
    templateCode,
    imports: extractImports(code),
    exports: extractExports(stripped),
    declared: declaredNames(stripped),
    ids: new Set([...identifiers(stripped), ...identifiers(templateCode)]),
    tags: isVue ? templateTags(template) : new Map(),
    classification: classify(project, rel),
    unknown: [],
    packageUses: [],
  }
  info.importedNames = new Set(info.imports.flatMap((i) => i.names))
  return info
}

/** Composable-looking calls (`useX(`) in a file's script and template expressions, with lines. */
function composableCalls(info) {
  const out = new Map()
  const scan = (code, offset) => {
    for (const m of code.matchAll(/(?<![\w$.])(use[A-Z][\w$]*)\s*\(/g)) {
      if (!out.has(m[1])) out.set(m[1], lineAt(code, m.index) + offset)
    }
  }
  scan(info.stripped, info.isVue ? info.scriptLine - 1 : 0)
  if (info.templateCode) scan(info.templateCode, 0)
  return out
}

function lineAt(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++
  return line
}

/**
 * Analyzes every source file and returns { files: Map<rel, info>, edges, catalog, unknown, packageUses }.
 * Edge: { from, to, via: 'import'|'auto-import'|'component', confidence, name, line, typeOnly, specifier }.
 */
export function buildGraph(project, { autoImports = true } = {}) {
  const files = new Map()
  let newestSourceMtime = 0
  for (const f of sourceFiles(project)) {
    files.set(f.rel, analyzeFile(project, f))
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
  const unknownByName = new Map()
  const packageByName = new Map()
  const note = (map, name, kind, file, source) => {
    if (!map.has(name)) map.set(name, { name, kind, source, files: new Set() })
    map.get(name).files.add(file)
  }

  for (const info of files.values()) {
    for (const imp of info.imports) {
      const target = resolveImport(project, info.rel, imp.source)
      if (!target || target === info.rel) continue
      edges.push({ from: info.rel, to: target, via: 'import', confidence: 'verified', name: imp.names.join(', ') || imp.kind, line: imp.line, typeOnly: imp.typeOnly, specifier: imp.source })
    }
    if (!autoImports) continue
    const resolvedSymbols = new Set()
    for (const [name, entry] of catalog.symbols) {
      if (entry.file === info.rel || !info.ids.has(name) || info.declared.has(name) || info.importedNames.has(name)) continue
      resolvedSymbols.add(name)
      const scriptLines = findIdentifier(info.stripped, name)
      const line = scriptLines.length ? scriptLines[0] + (info.isVue ? info.scriptLine - 1 : 0) : info.templateLine || 1
      edges.push({ from: info.rel, to: entry.file, via: 'auto-import', confidence: entry.confidence ?? 'inferred', name, line, typeOnly: false, specifier: null, kind: entry.kind })
    }
    for (const [name, line] of composableCalls(info)) {
      if (resolvedSymbols.has(name) || info.declared.has(name) || info.importedNames.has(name) || BUILTIN_COMPOSABLES.has(name) || catalog.symbols.has(name)) continue
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
      if (info.importedNames.has(tag) || info.importedNames.has(name)) continue
      const line = (lines[0] ?? 1) + (info.templateLine ? info.templateLine - 1 : 0)
      const entry = catalog.components.get(name)
      if (entry) {
        if (entry.file !== info.rel) edges.push({ from: info.rel, to: entry.file, via: 'component', confidence: entry.confidence ?? 'inferred', name: tag, line, typeOnly: false, specifier: null })
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
  return { files, edges, catalog, unknown: toList(unknownByName), packageUses: toList(packageByName) }
}

/** Root directory of a module when the path follows a modules convention, else null. */
export function moduleRootOf(relPath) {
  const m = /^((?:[^/]+\/)*?(?:features|modules|domains|modulos|dominios|slices)\/[^/]+)\//.exec(relPath)
  return m ? m[1] : null
}
