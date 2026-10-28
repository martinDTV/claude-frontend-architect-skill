// Loads the compilers the semantic engine needs FROM THE AUDITED PROJECT, read-only and without
// installing anything: the project's own `typescript` package and `vue/compiler-sfc`. Only those two
// well-known compiler packages are ever required; project source files, configs (nuxt.config,
// next.config), plugins and npm scripts are never executed. When a compiler is missing or its API is
// not the JavaScript API this engine needs (TypeScript 7 ships only the native `tsc` binary), the
// engine reports the reason and the callers fall back to the lexical analysis.
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { exists, readJson } from '../fs.mjs'

const TS_REQUIRED_API = ['createSourceFile', 'resolveModuleName', 'parseJsonConfigFileContent', 'readConfigFile', 'forEachChild', 'SyntaxKind', 'ScriptTarget', 'ScriptKind']
const SFC_REQUIRED_API = ['parse', 'compileScript']

function tryRequire(fromFile, id) {
  try {
    const req = createRequire(fromFile)
    const path = req.resolve(id)
    return { mod: req(path), path }
  } catch (error) {
    return { error: error?.code ?? error?.message ?? String(error) }
  }
}

function versionNear(path, pkgName) {
  // walk up from the resolved entry to the package's package.json
  let dir = dirname(path)
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, 'package.json')
    const json = exists(pkg) ? readJson(pkg) : null
    if (json?.name === pkgName && json.version) return json.version
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * TypeScript from the project (or `override`: a directory or package path). Returns
 * { ts, version, source: 'project'|'override'|'none', path, reason }.
 */
export function loadTypeScript(root, override) {
  const attempts = []
  if (override) {
    const base = isAbsolute(override) ? override : resolve(root, override)
    const candidates = [join(base, 'package.json'), join(base, 'node_modules', 'typescript', 'package.json'), base]
    for (const c of candidates) {
      if (!exists(c) && !exists(dirname(c))) continue
      const r = tryRequire(c.endsWith('package.json') ? c : join(c, 'package.json'), c.includes('node_modules/typescript') ? 'typescript' : 'typescript')
      if (!r.error) return finishTs(r, 'override', attempts)
      attempts.push(`${c}: ${r.error}`)
    }
    // override may point directly at the typescript package directory
    const direct = tryRequire(join(base, 'package.json'), join(base, 'lib', 'typescript.js'))
    if (!direct.error) return finishTs(direct, 'override', attempts)
    attempts.push(`override ${override}: not a TypeScript installation`)
  }
  const fromRoot = tryRequire(join(root, 'package.json'), 'typescript')
  if (!fromRoot.error) return finishTs(fromRoot, 'project', attempts)
  attempts.push(`project: ${fromRoot.error}`)
  // frameworks usually depend on typescript transitively; pnpm hides it from the root
  for (const via of ['nuxt', 'next', 'vite', 'vue-tsc']) {
    const pkg = tryRequire(join(root, 'package.json'), `${via}/package.json`)
    if (pkg.error) continue
    const nested = tryRequire(pkg.path, 'typescript')
    if (!nested.error) return finishTs(nested, `project (via ${via})`, attempts)
  }
  return { ts: null, version: null, source: 'none', path: null, reason: `typescript not resolvable from the project (${attempts.join('; ')}); pass --typescript <dir> or run the lexical engine` }
}

function finishTs(r, source, attempts) {
  const ts = r.mod
  const missing = TS_REQUIRED_API.filter((k) => !(k in ts))
  const version = ts.version ?? versionNear(r.path, 'typescript')
  if (missing.length) {
    return { ts: null, version, source: 'none', path: r.path, reason: `typescript ${version ?? '?'} at ${r.path} lacks the JavaScript compiler API (${missing.join(', ')}); TypeScript 7 publishes only the native tsc. Pass --typescript <dir with typescript 5.x/6.x> or use --engine lexical` }
  }
  return { ts, version, source, path: r.path, reason: attempts.length ? attempts.join('; ') : null }
}

/**
 * Vue's SFC compiler from the project: `vue/compiler-sfc`, also reachable through the `nuxt`
 * package when pnpm keeps `vue` out of the root (or `override`: a directory containing `vue`).
 */
export function loadVueCompiler(root, override) {
  const attempts = []
  const tryFrom = (file, id) => {
    const r = tryRequire(file, id)
    if (r.error) {
      attempts.push(`${id} from ${file}: ${r.error}`)
      return null
    }
    const missing = SFC_REQUIRED_API.filter((k) => typeof r.mod[k] !== 'function')
    if (missing.length) {
      attempts.push(`${id}: missing ${missing.join(', ')}`)
      return null
    }
    return { sfc: r.mod, version: r.mod.version ?? versionNear(r.path, '@vue/compiler-sfc') ?? versionNear(r.path, 'vue'), path: r.path }
  }
  if (override) {
    const base = isAbsolute(override) ? override : resolve(root, override)
    const hit = tryFrom(join(base, 'package.json'), 'vue/compiler-sfc') ?? tryFrom(join(base, 'package.json'), '@vue/compiler-sfc')
    if (hit) return { ...hit, source: 'override', reason: null }
  }
  const rootPkg = join(root, 'package.json')
  const direct = tryFrom(rootPkg, 'vue/compiler-sfc') ?? tryFrom(rootPkg, '@vue/compiler-sfc')
  if (direct) return { ...direct, source: 'project', reason: null }
  for (const via of ['nuxt', '@nuxt/kit', 'vite', '@vitejs/plugin-vue']) {
    const pkg = tryRequire(rootPkg, `${via}/package.json`)
    if (pkg.error) continue
    const hit = tryFrom(pkg.path, 'vue/compiler-sfc') ?? tryFrom(pkg.path, '@vue/compiler-sfc')
    if (hit) return { ...hit, source: `project (via ${via})`, reason: null }
  }
  return { sfc: null, version: null, source: 'none', path: null, reason: `vue/compiler-sfc not resolvable from the project (${attempts.slice(0, 2).join('; ')}); .vue files use the lexical splitter` }
}

/** Builds the semantic host for a project; `options`: { typescript, vueCompiler } overrides. */
export function createSemanticHost(project, options = {}) {
  const ts = loadTypeScript(project.root, options.typescript)
  const vue = loadVueCompiler(project.root, options.vueCompiler)
  const hasVueFiles = project.framework === 'nuxt' || project.framework === 'vue'
  return {
    available: Boolean(ts.ts),
    ts: ts.ts,
    typescript: { version: ts.version, source: ts.source, path: ts.path ? ts.path.replace(/.*node_modules\//, 'node_modules/') : null, reason: ts.reason },
    sfc: vue.sfc,
    vueCompiler: { version: vue.version, source: vue.source, path: vue.path ? vue.path.replace(/.*node_modules\//, 'node_modules/') : null, reason: hasVueFiles ? vue.reason : null },
  }
}
