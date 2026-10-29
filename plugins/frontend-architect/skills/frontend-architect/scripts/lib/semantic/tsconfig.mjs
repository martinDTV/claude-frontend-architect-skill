// Resolves the TypeScript compiler options that govern module resolution in the audited project,
// without enumerating or compiling its files. Nuxt 4 writes project references under .nuxt/
// (tsconfig.app.json, tsconfig.server.json) whose `paths` define `~`, `@`, `#shared`, `#imports`…;
// Next.js and Vite projects keep `paths`/`baseUrl` in the root tsconfig.json (with `extends`).
import { dirname, join } from 'node:path'
import { exists, rel } from '../fs.mjs'

function parseConfig(ts, file) {
  const read = ts.readConfigFile(file, ts.sys.readFile)
  if (read.error || !read.config) return null
  // A host that never enumerates directories: we need compilerOptions, not the file list.
  const host = { ...ts.sys, readDirectory: () => [] }
  const parsed = ts.parseJsonConfigFileContent(read.config, host, dirname(file), undefined, file)
  return { file, options: parsed.options, raw: read.config, errors: parsed.errors.filter((e) => e.code !== 18003) } // 18003: no inputs found
}

/**
 * Returns { app, server, default, candidates } where each area is { file, options } or null.
 * `forFile(rel)` picks the area for a project-relative path (server/** → server config).
 */
export function resolveCompilerOptions(ts, project) {
  const { root } = project
  const found = (...parts) => {
    const f = join(root, ...parts)
    return exists(f) ? f : null
  }
  const candidates = { app: [], server: [], default: [] }
  if (project.framework === 'nuxt') {
    candidates.app.push(found('.nuxt', 'tsconfig.app.json'), found('.nuxt', 'tsconfig.json'))
    candidates.server.push(found('.nuxt', 'tsconfig.server.json'), found('.nuxt', 'tsconfig.json'))
  }
  candidates.default.push(found('tsconfig.json'), found('jsconfig.json'))
  const pick = (list) => {
    for (const f of list) {
      if (!f) continue
      const parsed = parseConfig(ts, f)
      if (!parsed) continue
      // a root tsconfig that is only project references has no options of its own; keep looking
      const hasOwnOptions = parsed.raw.compilerOptions || parsed.raw.extends
      if (!hasOwnOptions && Array.isArray(parsed.raw.references)) continue
      return parsed
    }
    return null
  }
  const app = pick(candidates.app) ?? pick(candidates.default)
  const server = pick(candidates.server) ?? app
  const def = pick(candidates.default) ?? app
  // TypeScript project references and workspace packages: each referenced directory keeps its own options
  const areas = []
  const addArea = (configFile) => {
    if (!configFile || !exists(configFile)) return
    const parsed = parseConfig(ts, configFile)
    if (!parsed) return
    const dir = rel(root, dirname(configFile))
    if (dir === '' || dir === '.' || areas.some((a) => a.dir === dir)) return
    areas.push({ dir, config: parsed })
  }
  const rootConfig = found('tsconfig.json')
  if (rootConfig) {
    const raw = ts.readConfigFile(rootConfig, ts.sys.readFile).config
    for (const ref of raw?.references ?? []) {
      if (!ref?.path) continue
      const target = join(root, ref.path)
      addArea(/\.json$/.test(ref.path) ? target : join(target, 'tsconfig.json'))
    }
  }
  for (const p of project.workspace?.packages ?? []) addArea(join(root, p.dir, 'tsconfig.json'))
  areas.sort((a, b) => b.dir.length - a.dir.length)
  const describe = (c) => (c ? { file: rel(root, c.file), moduleResolution: ts.ModuleResolutionKind?.[c.options.moduleResolution] ?? c.options.moduleResolution ?? null, paths: Object.keys(c.options.paths ?? {}).length, baseUrl: c.options.baseUrl ? rel(root, c.options.baseUrl) : null } : null)
  return {
    app,
    server,
    default: def,
    areas,
    summary: { app: describe(app), server: describe(server), default: describe(def), references: areas.map((a) => ({ dir: a.dir, ...describe(a.config) })) },
    forFile(relPath) {
      const area = areas.find((a) => relPath.startsWith(`${a.dir}/`))
      if (area) return area.config
      if (relPath.startsWith('server/') && server) return server
      return app ?? def
    },
  }
}
