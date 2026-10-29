// Optional TypeScript Program + TypeChecker layer (1.3, opt-in with --typecheck). It verifies the
// syntactic symbol origins against the compiler's own alias resolution (`checker.getAliasedSymbol`),
// which follows `export *`, `export =`, namespace merges and declaration files the way tsc does.
//
// Cost model: a Program parses and binds every root file and the libraries they reach, so memory
// grows with the project. It is created lazily, only when a tool asks for it, only for TypeScript and
// JavaScript files (not .vue, which the Program cannot load), and only under a file budget; when the
// budget is exceeded or creation fails, the syntactic results stand and the report says why.
//
// Safety: the default compiler host only reads files. `plugins` are stripped from the options, no
// emit happens, no project configuration code is executed (tsconfig is read as JSON upstream).
import { join } from 'node:path'
import { toPosix } from '../fs.mjs'

export function createTypeChecker(ts, project, compilerOptions, files, { maxFiles = 2500 } = {}) {
  const root = project.root
  const rootPosix = toPosix(root)
  const rootNames = [...files.keys()].filter((r) => /\.(?:[cm]?[jt]sx?)$/.test(r) && !r.endsWith('.d.ts')).map((r) => join(root, r))
  if (!rootNames.length) return { available: false, reason: 'no TypeScript or JavaScript files to check' }
  if (rootNames.length > maxFiles) return { available: false, reason: `${rootNames.length} files exceed the --typecheck-max-files budget (${maxFiles})` }
  const base = compilerOptions.app?.options ?? compilerOptions.default?.options ?? {}
  const options = { ...base, noEmit: true, skipLibCheck: true, allowJs: true, checkJs: false, declaration: false, composite: false, incremental: false, tsBuildInfoFile: undefined }
  delete options.plugins
  const t0 = performance.now()
  const heap0 = process.memoryUsage().heapUsed
  let program
  let checker
  try {
    const host = ts.createCompilerHost(options, true)
    program = ts.createProgram({ rootNames, options, host })
    checker = program.getTypeChecker()
  } catch (error) {
    return { available: false, reason: `program creation failed: ${error?.message ?? error}` }
  }
  const stats = { files: rootNames.length, sourceFiles: program.getSourceFiles().length, durationMs: Math.round(performance.now() - t0), heapMb: Math.round(((process.memoryUsage().heapUsed - heap0) / 1024 / 1024) * 10) / 10 }
  const toRel = (abs) => {
    const p = toPosix(abs)
    return p.startsWith(`${rootPosix}/`) && !p.includes('/node_modules/') ? p.slice(rootPosix.length + 1) : null
  }

  /** Where the compiler says the name bound as `localName` in `fromRel` is declared. */
  function originOf(fromRel, localName) {
    const sf = program.getSourceFile(join(root, fromRel))
    if (!sf) return { status: 'skipped', reason: 'not in the program' }
    let node = null
    const visit = (n) => {
      if (node) return
      if (ts.isImportDeclaration(n) && n.importClause) {
        const c = n.importClause
        if (c.name?.text === localName) node = c.name
        const nb = c.namedBindings
        if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (el.name.text === localName) node = el.name
        if (nb && ts.isNamespaceImport(nb) && nb.name.text === localName) node = nb.name
      } else if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) {
        for (const el of n.exportClause.elements) if ((el.propertyName ?? el.name).text === localName) node = el.propertyName ?? el.name
      } else ts.forEachChild(n, visit)
    }
    visit(sf)
    if (!node) return { status: 'skipped', reason: 'binding not found' }
    let symbol = checker.getSymbolAtLocation(node)
    if (!symbol) return { status: 'unresolved' }
    try {
      if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
    } catch {
      return { status: 'unresolved' }
    }
    const decl = symbol.declarations?.[0]
    if (!decl || symbol.flags & ts.SymbolFlags.Transient) return { status: 'unresolved' }
    const file = decl.getSourceFile().fileName
    const rel = toRel(file)
    const isValue = Boolean(symbol.flags & ts.SymbolFlags.Value)
    return { status: rel ? 'declared' : 'external', file: rel, name: symbol.getName(), kind: isValue ? 'value' : 'type' }
  }

  return { available: true, originOf, stats }
}
