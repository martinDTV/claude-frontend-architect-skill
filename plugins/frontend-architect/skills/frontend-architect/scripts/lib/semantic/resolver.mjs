// Module resolution for the semantic engine: TypeScript's own resolver with the project's compiler
// options (paths, baseUrl, moduleResolution), then the project's tsconfig `paths` applied by hand for
// files TypeScript does not resolve on its own (.vue), then the lexical alias fallback (inferred).
// Nothing is executed; `ts.sys` only reads files and directories.
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { exists, toPosix } from '../fs.mjs'
import { resolveImport as lexicalResolve } from '../project.mjs'

const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.vue', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.vue']

function isDir(p) {
  try {
    return require('node:fs').statSync(p).isDirectory()
  } catch {
    return false
  }
}
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

function packageName(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/')
  return specifier.split('/')[0]
}

/** Applies tsconfig `paths` patterns (`~/*`, `@/*`, `#shared/*`) to a specifier; returns absolute candidates. */
function applyPaths(options, specifier) {
  const paths = options.paths ?? {}
  const base = options.pathsBasePath ?? options.baseUrl ?? null
  if (!base) return []
  const out = []
  for (const [pattern, targets] of Object.entries(paths)) {
    const star = pattern.indexOf('*')
    let rest = null
    if (star >= 0) {
      const prefix = pattern.slice(0, star)
      const suffix = pattern.slice(star + 1)
      if (specifier.startsWith(prefix) && specifier.endsWith(suffix) && specifier.length >= pattern.length - 1) rest = specifier.slice(prefix.length, specifier.length - suffix.length)
    } else if (specifier === pattern) rest = ''
    if (rest === null) continue
    for (const t of targets) out.push(resolve(base, t.replace('*', rest)))
  }
  return out
}

const NODE_BUILTINS = new Set(['fs', 'path', 'crypto', 'url', 'os', 'util', 'events', 'stream', 'http', 'https', 'zlib', 'buffer', 'child_process', 'module', 'assert', 'readline', 'worker_threads', 'perf_hooks', 'async_hooks', 'net', 'tls', 'dns', 'querystring', 'string_decoder', 'timers', 'vm', 'v8', 'process', 'cluster', 'dgram', 'inspector', 'punycode', 'tty', 'constants', 'repl'])

export function createResolver(ts, project, compilerOptions) {
  const root = project.root
  const declared = new Set(Object.keys(project.deps ?? {}))
  const rootPosix = toPosix(root)
  const toRel = (abs) => {
    const p = toPosix(abs)
    return p.startsWith(`${rootPosix}/`) ? p.slice(rootPosix.length + 1) : null
  }
  const classifyFile = (abs, method) => {
    const posix = toPosix(abs)
    if (posix.includes('/node_modules/')) return { status: 'package', name: packageName(posix.split('/node_modules/').pop()), method }
    const relPath = toRel(abs)
    if (!relPath) return { status: 'outside', file: posix, method }
    if (relPath.startsWith('.nuxt/') || relPath.startsWith('.next/')) return { status: 'package', name: relPath.startsWith('.nuxt/') ? 'nuxt' : 'next', method, generated: true }
    return { status: 'project', file: relPath, method }
  }

  /**
   * resolve(fromRel, specifier) → { status: 'project'|'package'|'unknown'|'outside', file?, name?, method, confidence }
   */
  function resolveSpecifier(fromRel, specifier) {
    if (!specifier) return { status: 'unknown', reason: 'non-literal specifier', confidence: 'unknown' }
    const fromAbs = join(root, fromRel)
    const options = compilerOptions.forFile(fromRel)?.options ?? {}
    // 1. TypeScript's resolver
    try {
      const r = ts.resolveModuleName(specifier, fromAbs, options, ts.sys)
      const rm = r.resolvedModule
      if (rm) {
        const c = classifyFile(rm.resolvedFileName, 'typescript')
        // report the package the code names, not the @types package TypeScript landed in
        if (c.status === 'package' && !c.generated && !specifier.startsWith('.') && !specifier.startsWith('/')) c.name = packageName(specifier)
        if (c.status === 'project' && /\.d\.ts$/.test(c.file) && !exists(join(root, c.file))) return { ...c, confidence: 'verified' }
        if (c.status === 'project' && /\.d\.ts$/.test(c.file)) {
          // a .d.ts shim next to a real source file: prefer the source
          const src = c.file.replace(/\.d\.ts$/, '')
          for (const ext of ['.ts', '.tsx', '.js', '.vue']) if (exists(join(root, src + ext))) return { status: 'project', file: src + ext, method: 'typescript', confidence: 'verified' }
        }
        return { ...c, confidence: 'verified' }
      }
    } catch {
      /* fall through */
    }
    // 2. tsconfig paths by hand (covers .vue and other non-TS targets)
    for (const candidate of applyPaths(options, specifier)) {
      for (const ext of EXTENSIONS) {
        const abs = candidate + ext
        if (exists(abs) && !isDir(abs)) return { ...classifyFile(abs, 'tsconfig-paths'), confidence: 'verified' }
      }
    }
    // 3. relative / absolute specifiers with extensions TypeScript skipped (.vue)
    if (specifier.startsWith('.') || isAbsolute(specifier)) {
      const base = isAbsolute(specifier) ? specifier : resolve(dirname(fromAbs), specifier)
      for (const ext of EXTENSIONS) {
        const abs = base + ext
        if (exists(abs) && !isDir(abs)) return { ...classifyFile(abs, 'relative'), confidence: 'verified' }
      }
      return { status: 'unknown', reason: 'file not found', confidence: 'unknown' }
    }
    // 4. bare specifiers: Node built-ins, packages present in node_modules or declared in package.json,
    //    else the lexical alias fallback
    if (/^node:/.test(specifier) || NODE_BUILTINS.has(specifier)) return { status: 'package', name: 'node', method: 'builtin', confidence: 'verified' }
    if (!/^[~@#]\/|^~~|^@@|^#/.test(specifier)) {
      const pkg = packageName(specifier)
      if (declared.has(pkg)) return { status: 'package', name: pkg, method: 'package.json', confidence: 'verified' }
      let dir = dirname(fromAbs)
      for (let i = 0; i < 12; i++) {
        if (exists(join(dir, 'node_modules', pkg))) return { status: 'package', name: pkg, method: 'node_modules', confidence: 'verified' }
        const parent = dirname(dir)
        if (parent === dir) break
        dir = parent
      }
    }
    const lexical = lexicalResolve(project, fromRel, specifier)
    if (lexical) return { status: 'project', file: lexical, method: 'lexical-fallback', confidence: 'inferred' }
    if (/^#(imports|app|build|components|nitro|internal)/.test(specifier)) return { status: 'package', name: 'nuxt', method: 'virtual', confidence: 'verified' }
    return { status: 'unknown', reason: 'unresolved specifier', confidence: 'unknown' }
  }
  return { resolve: resolveSpecifier }
}
