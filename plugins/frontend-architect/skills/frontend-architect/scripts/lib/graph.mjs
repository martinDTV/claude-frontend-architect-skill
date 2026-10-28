// Builds the file graph: explicit imports, Nuxt auto-import symbol uses and template component
// uses. Shared by domain-deps, state-audit, routes-audit and contracts-check.
import { readText } from './fs.mjs'
import { autoImportCatalog, classify, resolveImport, sourceFiles } from './project.mjs'
import {
  countLines, declaredNames, extractExports, extractImports, findIdentifier, identifiers, splitSfc, stripCode,
  templateExpressions, templateTags,
} from './source.mjs'

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
  }
  info.importedNames = new Set(info.imports.flatMap((i) => i.names))
  return info
}

/**
 * Analyzes every source file and returns { files: Map<rel, info>, edges, catalog }.
 * Edge: { from, to, via: 'import'|'auto-import'|'component', name, line, typeOnly, specifier }.
 */
export function buildGraph(project, { autoImports = true } = {}) {
  const files = new Map()
  for (const f of sourceFiles(project)) files.set(f.rel, analyzeFile(project, f))
  const catalog = autoImports ? autoImportCatalog(project) : { symbols: new Map(), components: new Map(), collisions: [] }
  const edges = []

  for (const info of files.values()) {
    for (const imp of info.imports) {
      const target = resolveImport(project, info.rel, imp.source)
      if (!target || target === info.rel) continue
      edges.push({ from: info.rel, to: target, via: 'import', name: imp.names.join(', ') || imp.kind, line: imp.line, typeOnly: imp.typeOnly, specifier: imp.source })
    }
    if (!autoImports) continue
    for (const [name, entry] of catalog.symbols) {
      if (entry.file === info.rel || !info.ids.has(name) || info.declared.has(name) || info.importedNames.has(name)) continue
      const scriptLines = findIdentifier(info.stripped, name)
      const line = scriptLines.length ? scriptLines[0] + (info.isVue ? info.scriptLine : 0) : info.templateLine || 1
      edges.push({ from: info.rel, to: entry.file, via: 'auto-import', name, line, typeOnly: false, specifier: null, kind: entry.kind })
    }
    for (const [tag, lines] of info.tags) {
      const name = tag.startsWith('Lazy') && !catalog.components.has(tag) ? tag.slice(4) : tag
      if (info.importedNames.has(tag) || info.importedNames.has(name)) continue
      const target = catalog.components.get(name)
      if (!target || target === info.rel) continue
      edges.push({ from: info.rel, to: target, via: 'component', name: tag, line: (lines[0] ?? 1) + (info.templateLine ? info.templateLine - 1 : 0), typeOnly: false, specifier: null })
    }
  }
  return { files, edges, catalog }
}

/** Root directory of a module when the path follows a modules convention, else null. */
export function moduleRootOf(relPath) {
  const m = /^((?:[^/]+\/)*?(?:features|modules|domains|modulos|dominios|slices)\/[^/]+)\//.exec(relPath)
  return m ? m[1] : null
}
