// Symbol-level resolution through barrels, done syntactically on the parsed module records:
// `export { a as b } from './x'`, `export * from './x'` (searched in order, with cycle and depth
// guards), `export { a }` of a name that was imported, and `export default`. No type checker is
// involved: a name is "declared" when a file in the chain exports it from its own code, "not-found"
// when no file in the chain does, "external" when the chain leaves the project (a package),
// "cycle" or "too-deep" when the chain cannot be followed. Each result says how many barrel hops
// it took, so a tool can tell `import { x } from '~/dominios/a'` apart from the file that owns x.
const MAX_DEPTH = 12

export function createSymbolResolver(files, resolver) {
  const cache = new Map()

  function declaredIn(info, name) {
    return info.semantic.exports.find((e) => e.name === name) ?? null
  }

  /** The import record (kind re-export) that produced a given re-exported name, with the original name. */
  function originalNameOf(info, exp) {
    const imp = info.semantic.imports.find((i) => i.kind === 're-export' && i.source === exp.reexport && i.names.some((n) => n.local === exp.name))
    const n = imp?.names.find((x) => x.local === exp.name)
    return n ? n.imported : exp.name
  }

  /** Resolves `name` as exported by `fromRel`. `seen` guards cycles; chains and hops are relative to `fromRel`, so results are cacheable per file. */
  function resolve(fromRel, name, seen = new Set()) {
    const key = `${fromRel}#${name}`
    if (cache.has(key)) return cache.get(key)
    if (seen.has(fromRel)) return { status: 'cycle', name, chain: [fromRel], hops: 0 }
    if (seen.size > MAX_DEPTH) return { status: 'too-deep', name, chain: [fromRel], hops: 0 }
    // a .vue module's default export is the component itself (script setup declares no `export default`)
    if (fromRel.endsWith('.vue') && name === 'default') return { status: 'declared', name, file: fromRel, kind: 'value', chain: [fromRel], hops: 0 }
    const info = files.get(fromRel)
    // declaration files are not scanned as sources: the name is declared there as far as the type system is concerned
    if (!info?.semantic && /\.d\.(?:ts|mts|cts)$/.test(fromRel)) return { status: 'declaration-file', name, file: fromRel, kind: 'type', chain: [fromRel], hops: 0 }
    if (!info?.semantic) return { status: 'unknown', name, reason: 'file not analysed (excluded or lexical engine)', chain: [fromRel], hops: 0 }
    const nextSeen = new Set(seen).add(fromRel)
    const through = (sub) => ({ ...sub, chain: [fromRel, ...(sub.chain ?? [])] })
    const leave = (target) => ({ status: target.status === 'package' ? 'external' : 'unknown', name, package: target.name ?? null, chain: [fromRel] })
    let result = null

    const exp = declaredIn(info, name)
    if (exp) {
      if (exp.reexport) {
        // export { original as name } from './source'
        const target = resolver.resolve(fromRel, exp.reexport)
        result = target.status === 'project' ? through(resolve(target.file, originalNameOf(info, exp), nextSeen)) : leave(target)
      } else {
        // export { local as name } where local is an import, or a declaration of this file
        const local = exp.local ?? name
        const viaImport = info.semantic.imports.find((i) => i.kind === 'static' && i.names.some((n) => n.local === local))
        if (viaImport) {
          const n = viaImport.names.find((x) => x.local === local)
          const target = resolver.resolve(fromRel, viaImport.source)
          result = target.status === 'project' ? through(resolve(target.file, n.imported, nextSeen)) : leave(target)
        } else result = { status: 'declared', name, file: fromRel, kind: exp.kind, line: exp.line, chain: [fromRel] }
      }
    } else {
      // export * from './x' (not `export * as ns`): the first module that declares the name wins, as in ESM
      const stars = info.semantic.imports.filter((i) => i.kind === 're-export' && !i.namespaceExport && i.names.some((n) => n.local === '*'))
      let external = null
      for (const star of stars) {
        const target = resolver.resolve(fromRel, star.source)
        if (target.status !== 'project') {
          external ??= { ...leave(target), viaStar: true }
          continue
        }
        const r = resolve(target.file, name, nextSeen)
        if (r.status === 'declared') {
          result = { ...through(r), viaStar: true }
          break
        }
      }
      // export * as ns from './x' → the namespace itself
      const ns = info.semantic.imports.find((i) => i.kind === 're-export' && i.namespaceExport === name)
      if (!result && ns) {
        const target = resolver.resolve(fromRel, ns.source)
        result = target.status === 'project' ? { status: 'namespace', name, file: target.file, chain: [fromRel, target.file] } : leave(target)
      }
      if (!result) result = external ? { ...external, status: 'external-or-missing' } : { status: 'not-found', name, chain: [fromRel] }
    }
    result.hops = Math.max(0, (result.chain?.length ?? 1) - 1)
    if (result.status !== 'cycle' && result.status !== 'too-deep') cache.set(key, result)
    return result
  }

  return { resolve }
}

/** Compact origin record for a report: where an imported name is really declared. */
export function describeOrigin(r) {
  return { status: r.status, file: r.file ?? null, kind: r.kind ?? null, hops: r.hops ?? 0, viaStar: Boolean(r.viaStar), package: r.package ?? null }
}
