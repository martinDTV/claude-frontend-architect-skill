// Project detection, Nuxt auto-import catalog, Next.js layout and domain classification.
// Configuration is textual (regex over nuxt.config.*): report anything derived here as heuristic.
import { statSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import { exists, firstExisting, globToRegExp, readJson, readText, rel, walk } from './fs.mjs'
import { extractExports, stripCode } from './source.mjs'

export const CONFIG_FILES = ['.frontend-audit.json', 'frontend-audit.config.json']

const DEFAULT_CONFIG = {
  domains: {},
  shell: [],
  shared: [],
  publicRoutes: [],
  authPatterns: [],
  coreDomains: ['auth', 'session', 'account', 'identity', 'organizations', 'tenant', 'tenants', 'workspace', 'workspaces', 'core'],
  coreStores: ['auth', 'session', 'user', 'ui', 'preferences', 'settings', 'app', 'notifications', 'theme', 'locale', 'i18n'],
  excludeTests: true,
  budgets: null,
}

/** Loads `.frontend-audit.json` (or `--config`) merged over defaults. */
export function loadConfig(root, explicitPath) {
  const file = explicitPath ? (isAbsolute(explicitPath) ? explicitPath : join(root, explicitPath)) : firstExisting(...CONFIG_FILES.map((f) => join(root, f)))
  const user = file ? readJson(file) : null
  if (explicitPath && !user) throw new Error(`Config file not found or invalid JSON: ${explicitPath}`)
  const config = { ...DEFAULT_CONFIG, ...(user ?? {}), file: file ? rel(root, file) : null }
  config.domainMatchers = Object.entries(config.domains ?? {}).map(([domain, globs]) => ({
    domain,
    res: [].concat(globs).map(globToRegExp),
  }))
  config.shellRes = [].concat(config.shell ?? []).map(globToRegExp)
  config.sharedRes = [].concat(config.shared ?? []).map(globToRegExp)
  config.publicRouteRes = [].concat(config.publicRoutes ?? []).map(globToRegExp)
  return config
}

function majorOf(range) {
  const m = /(\d+)/.exec(String(range ?? ''))
  return m ? Number(m[1]) : null
}

function resolveAlias(path, root, srcDir) {
  if (path.startsWith('~~/') || path.startsWith('@@/')) return join(root, path.slice(3))
  if (path.startsWith('~/') || path.startsWith('@/')) return join(root, srcDir, path.slice(2))
  if (path.startsWith('./')) return join(root, path.slice(2))
  if (path.startsWith('/')) return path
  return join(root, srcDir, path)
}

/** Detects framework, source directory and the configuration that affects auto-imports and routing. */
export function detectProject(root, config = loadConfig(root)) {
  const pkg = readJson(join(root, 'package.json')) ?? {}
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  let framework = 'unknown'
  if (deps.nuxt) framework = 'nuxt'
  else if (deps.next) framework = 'next'
  else if (deps.vue) framework = 'vue'
  else if (deps.react) framework = 'react'

  const project = { root, framework, pkg, deps, config, srcDir: '.', nuxt: null, next: null, notes: [] }

  if (framework === 'nuxt') {
    const configFile = firstExisting(join(root, 'nuxt.config.ts'), join(root, 'nuxt.config.js'), join(root, 'nuxt.config.mjs'))
    const raw = configFile ? readText(configFile) : ''
    const stripped = stripCode(raw)
    const major = majorOf(deps.nuxt)
    const compatV4 = /compatibilityVersion\s*:\s*4/.test(stripped)
    let srcDir = (major !== null && major >= 4) || compatV4 ? 'app' : '.'
    const srcDirMatch = /\bsrcDir\s*:\s*['"]([^'"]+)['"]/.exec(raw)
    if (srcDirMatch) srcDir = srcDirMatch[1].replace(/\/$/, '')
    if (srcDir === 'app' && !exists(join(root, 'app'))) srcDir = '.'
    project.srcDir = srcDir

    const ssr = !/\bssr\s*:\s*false/.test(stripped)
    const routeRulesSsrFalse = [...raw.matchAll(/['"]([^'"]+)['"]\s*:\s*\{[^}]*\bssr\s*:\s*false/g)].map((m) => m[1])

    const importsDirs = []
    const importsBlock = /\bimports\s*:\s*\{([\s\S]*?)\n\s*\}/.exec(raw)?.[1] ?? ''
    const dirsMatch = /\bdirs\s*:\s*\[([^\]]*)\]/.exec(importsBlock)
    if (dirsMatch) for (const m of dirsMatch[1].matchAll(/['"]([^'"]+)['"]/g)) importsDirs.push(m[1])

    const componentDirs = [{ path: join(root, srcDir, 'components'), prefix: '', pathPrefix: true, default: true }]
    const componentsMatch = /\bcomponents\s*:\s*(\[[\s\S]*?\]|\{[\s\S]*?\})/.exec(raw)
    if (componentsMatch) {
      let block = componentsMatch[1]
      const inner = /\bdirs\s*:\s*\[([\s\S]*?)\]/.exec(block)
      if (inner) block = inner[1]
      componentDirs.length = 0
      const entries = block.split(/\},|(?<=['"])\s*,/)
      for (const entry of entries) {
        const obj = /path\s*:\s*['"]([^'"]+)['"]/.exec(entry)
        const str = !obj && /^\s*\[?\s*['"]([^'"]+)['"]/.exec(entry)
        const path = obj?.[1] ?? str?.[1]
        if (!path) continue
        componentDirs.push({
          path: resolveAlias(path, root, srcDir),
          prefix: /prefix\s*:\s*['"]([^'"]+)['"]/.exec(entry)?.[1] ?? '',
          pathPrefix: !/pathPrefix\s*:\s*false/.test(entry),
          default: false,
        })
      }
      if (!componentDirs.some((d) => d.path === join(root, srcDir, 'components'))) {
        // Nuxt keeps scanning ~/components when custom dirs are listed, unless the list replaces it
        componentDirs.push({ path: join(root, srcDir, 'components'), prefix: '', pathPrefix: true, default: true })
      }
    }

    const hasPinia = Boolean(deps['@pinia/nuxt'])
    const storesDirs = hasPinia ? [join(root, srcDir, 'stores')] : []
    const storesMatch = /\bpinia\s*:\s*\{[\s\S]*?storesDirs\s*:\s*\[([^\]]*)\]/.exec(raw)
    if (storesMatch) {
      storesDirs.length = 0
      for (const m of storesMatch[1].matchAll(/['"]([^'"]+)['"]/g)) storesDirs.push(resolveAlias(m[1], root, srcDir))
    }
    const modules = [...(/\bmodules\s*:\s*\[([^\]]*)\]/.exec(raw)?.[1]?.matchAll(/['"]([^'"]+)['"]/g) ?? [])].map((m) => m[1])
    const layers = exists(join(root, 'layers')) ? walkDirs(join(root, 'layers')) : []
    const extendsList = [...(/\bextends\s*:\s*\[([^\]]*)\]/.exec(raw)?.[1]?.matchAll(/['"]([^'"]+)['"]/g) ?? [])].map((m) => m[1])

    project.nuxt = {
      configFile: configFile ? rel(root, configFile) : null,
      major,
      srcDir,
      ssr,
      routeRulesSsrFalse,
      importsDirs: importsDirs.map((d) => resolveAlias(d, root, srcDir)),
      componentDirs,
      hasPinia,
      storesDirs,
      modules,
      layers,
      extends: extendsList,
    }
    if (!configFile) project.notes.push('nuxt.config.* not found: assuming Nuxt defaults')
  }

  if (framework === 'next') {
    const srcDir = exists(join(root, 'src')) ? 'src' : '.'
    const appDir = firstExisting(join(root, srcDir, 'app'), join(root, 'app'))
    const pagesDir = firstExisting(join(root, srcDir, 'pages'), join(root, 'pages'))
    const proxyFile = firstExisting(
      join(root, srcDir, 'proxy.ts'), join(root, 'proxy.ts'), join(root, srcDir, 'middleware.ts'), join(root, 'middleware.ts'),
    )
    project.srcDir = srcDir
    project.next = {
      major: majorOf(deps.next),
      appDir: appDir ? rel(root, appDir) : null,
      pagesDir: pagesDir ? rel(root, pagesDir) : null,
      proxyFile: proxyFile ? rel(root, proxyFile) : null,
    }
  }

  if (framework === 'vue' || framework === 'react') project.srcDir = exists(join(root, 'src')) ? 'src' : '.'
  return project
}

function walkDirs(dir) {
  try {
    return walk(dir, { extensions: null }).map((f) => rel(dir, f).split('/')[0]).filter((v, i, a) => a.indexOf(v) === i)
  } catch {
    return []
  }
}

// ---- Nuxt component names -------------------------------------------------------------------

/** scule-like split: `BaseFooBar` → [Base, Foo, Bar]; `my-button_v2` → [my, button, v2]. */
export function splitByCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1\u0000$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1\u0000$2')
    .split(/[\u0000\-_./\s]+/)
    .filter(Boolean)
}

function pascal(parts) {
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join('')
}

/**
 * Nuxt's component name rule: directory segments prefix the file name, and a prefix that the
 * file name already starts with is not repeated (`components/crm/CrmBadge.vue` → `CrmBadge`).
 */
export function nuxtComponentName(dirSegments, fileName, { prefix = '', pathPrefix = true } = {}) {
  let prefixParts = pathPrefix ? [...dirSegments] : []
  let name = fileName
  if (name.toLowerCase() === 'index' && prefixParts.length) name = prefixParts.pop()
  if (prefix) prefixParts = [...splitByCase(prefix), ...prefixParts]
  const fileParts = splitByCase(name)
  const fileContent = fileParts.join('/').toLowerCase()
  let nameParts = prefixParts.flatMap((p) => splitByCase(p))
  const matched = []
  for (let index = prefixParts.length - 1; index >= 0; index--) {
    matched.unshift(...splitByCase(prefixParts[index]).map((p) => p.toLowerCase()))
    const content = matched.join('/')
    const repeated = prefixParts[index].toLowerCase() === fileContent && prefixParts[index + 1] !== undefined && prefixParts[index] === prefixParts[index + 1]
    if (fileContent === content || fileContent.startsWith(`${content}/`) || repeated) {
      nameParts = prefixParts.slice(0, index).flatMap((p) => splitByCase(p))
    }
  }
  return pascal([...nameParts, ...fileParts])
}

// ---- Auto-import catalog ----------------------------------------------------------------------

/**
 * Symbols Nuxt auto-imports from the project (not from Vue/Nuxt themselves):
 * top-level files of composables/ and utils/, shared/utils and shared/types, imports.dirs,
 * Pinia stores dirs, and components (with Nuxt's naming rule). Returns
 * { symbols: Map<name, { file, kind }>, components: Map<Name, file>, collisions: [] }.
 */
export function autoImportCatalog(project) {
  const symbols = new Map()
  const components = new Map()
  const collisions = []
  if (project.framework !== 'nuxt') return { symbols, components, collisions, source: 'lexical' }
  const { root, srcDir, nuxt } = project

  const register = (name, file, kind) => {
    if (!name || name === '*' ) return
    const previous = symbols.get(name)
    if (previous && previous.file !== file) collisions.push({ name, files: [previous.file, file] })
    symbols.set(name, { file, kind, confidence: 'inferred' })
  }
  const scanTopLevel = (dir, kind, { recursive = false } = {}) => {
    if (!exists(dir)) return
    const files = recursive
      ? walk(dir, { extensions: ['.ts', '.js', '.mts', '.mjs', '.tsx'] })
      : walk(dir, { extensions: ['.ts', '.js', '.mts', '.mjs', '.tsx'] }).filter((f) => dirname(f) === dir)
    for (const file of files) {
      if (/\.(spec|test|d)\.[cm]?[jt]sx?$/.test(file)) continue
      const relFile = rel(root, file)
      const stripped = stripCode(readText(file))
      for (const name of extractExports(stripped)) {
        if (name === 'default') register(camelCase(basename(file, extname(file))), relFile, kind)
        else register(name, relFile, kind)
      }
    }
  }
  scanTopLevel(join(root, srcDir, 'composables'), 'composable')
  scanTopLevel(join(root, srcDir, 'utils'), 'util')
  scanTopLevel(join(root, 'shared', 'utils'), 'shared')
  scanTopLevel(join(root, 'shared', 'types'), 'shared')
  for (const dir of nuxt.importsDirs) {
    const clean = dir.replace(/\/\*\*?$/, '')
    scanTopLevel(clean, 'imports.dirs', { recursive: /\*\*$/.test(dir) })
  }
  for (const dir of nuxt.storesDirs) scanTopLevel(dir, 'store')
  // Nuxt 4 layers (layers/<x>/app/...) and Nuxt 3 style layers (layers/<x>/...): same scanning rules
  const layerDirs = []
  for (const layer of nuxt.layers) {
    const base = join(root, 'layers', layer)
    const app = exists(join(base, 'app')) ? join(base, 'app') : base
    scanTopLevel(join(app, 'composables'), 'layer-composable')
    scanTopLevel(join(app, 'utils'), 'layer-util')
    if (exists(join(app, 'components'))) layerDirs.push({ path: join(app, 'components'), prefix: '', pathPrefix: true, default: false, layer })
  }

  const registerComponent = (name, relFile) => {
    const previous = components.get(name)
    if (previous && previous.file !== relFile) collisions.push({ name, files: [previous.file, relFile] })
    components.set(name, { file: relFile, confidence: 'inferred' })
  }
  for (const entry of [...nuxt.componentDirs, ...layerDirs]) {
    if (!exists(entry.path)) continue
    for (const file of walk(entry.path, { extensions: ['.vue', '.tsx', '.jsx'] })) {
      const relToDir = rel(entry.path, file)
      const segments = relToDir.split('/')
      const fileName = segments.pop().split('.')[0]
      const name = nuxtComponentName(segments, fileName, { prefix: entry.prefix, pathPrefix: entry.pathPrefix })
      registerComponent(name, rel(root, file))
    }
  }
  return { symbols, components, collisions, source: 'lexical' }
}

// ---- Nuxt-generated metadata -------------------------------------------------------------------

const META_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.mjs', '.mts', '.vue', '/index.ts', '/index.js']

/** Short package name from a node_modules path (`…/node_modules/@vueuse/core/index` → `@vueuse/core`). */
function packageNameOf(path) {
  const idx = path.lastIndexOf('node_modules/')
  if (idx < 0) return 'nuxt'
  const after = path.slice(idx + 'node_modules/'.length).split('/')
  return after[0]?.startsWith('@') ? `${after[0]}/${after[1] ?? ''}` : after[0] ?? 'unknown'
}

/**
 * Reads the catalogs Nuxt itself generates (`.nuxt/types/imports.d.ts`, `.nuxt/components.d.ts`)
 * when they exist. Project files become `verified` symbols; package-provided ones are listed
 * separately; entries pointing at files that no longer exist are dropped as stale. The files are
 * written by `nuxt prepare`/`nuxt dev`/`nuxt build`; they can be older than the source tree.
 */
export function nuxtGeneratedCatalog(project) {
  const result = { present: false, symbols: new Map(), components: new Map(), packageSymbols: new Map(), packageComponents: new Map(), stale: [], mtime: null, files: [] }
  if (project.framework !== 'nuxt') return result
  const { root } = project
  const importsFile = join(root, '.nuxt', 'types', 'imports.d.ts')
  const componentsFile = join(root, '.nuxt', 'components.d.ts')
  const rootPrefix = `${root.replace(/\\/g, '/')}/`

  const resolveMeta = (metaFile, importPath) => {
    const abs = resolveModulePath(dirname(metaFile), importPath).replace(/\\/g, '/')
    if (!abs.startsWith(rootPrefix) || abs.includes('/node_modules/')) return { kind: 'package', source: packageNameOf(abs) }
    if (abs.startsWith(`${rootPrefix}.nuxt/`)) return { kind: 'package', source: 'nuxt' }
    for (const ext of META_EXTENSIONS) {
      const candidate = `${abs}${ext}`
      if (exists(candidate) && !isDirectory(candidate)) return { kind: 'project', file: candidate.slice(rootPrefix.length) }
    }
    return { kind: 'stale', path: abs.slice(rootPrefix.length) }
  }

  if (exists(importsFile)) {
    result.present = true
    result.files.push(rel(root, importsFile))
    result.mtime = Math.max(result.mtime ?? 0, statSync(importsFile).mtimeMs)
    const text = readText(importsFile)
    for (const m of text.matchAll(/^\s*const\s+([A-Za-z_$][\w$]*)\s*:\s*typeof\s+import\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
      const [, name, importPath] = m
      const r = resolveMeta(importsFile, importPath)
      if (r.kind === 'project') result.symbols.set(name, { file: r.file, kind: 'nuxt-metadata', confidence: 'verified' })
      else if (r.kind === 'package') result.packageSymbols.set(name, r.source)
      else result.stale.push({ name, kind: 'symbol', path: r.path })
    }
  }
  if (exists(componentsFile)) {
    result.present = true
    result.files.push(rel(root, componentsFile))
    result.mtime = Math.max(result.mtime ?? 0, statSync(componentsFile).mtimeMs)
    const text = readText(componentsFile)
    for (const m of text.matchAll(/^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*:\s*(?:LazyComponent<\s*)?typeof\s+import\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
      const [, name, importPath] = m
      const r = resolveMeta(componentsFile, importPath)
      if (r.kind === 'project') result.components.set(name, { file: r.file, confidence: 'verified' })
      else if (r.kind === 'package') result.packageComponents.set(name, r.source)
      else result.stale.push({ name, kind: 'component', path: r.path })
    }
  }
  return result
}

function resolveModulePath(fromDir, importPath) {
  return normalizeAbsolute(join(fromDir, importPath))
}

function normalizeAbsolute(p) {
  const parts = []
  for (const seg of p.split(/[\\/]+/)) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return `/${parts.join('/')}`
}

/**
 * The catalog the graph uses: Nuxt metadata (verified) merged with the lexical scan (inferred).
 * `source` is 'nuxt-metadata+lexical' when metadata was found, otherwise 'lexical'.
 */
export function mergedCatalog(project) {
  const lexical = autoImportCatalog(project)
  const generated = nuxtGeneratedCatalog(project)
  const symbols = new Map()
  const components = new Map()
  const pathMismatches = []
  for (const [name, entry] of generated.symbols) symbols.set(name, entry)
  for (const [name, entry] of lexical.symbols) {
    const verified = symbols.get(name)
    if (!verified) symbols.set(name, entry)
    else if (verified.file !== entry.file) pathMismatches.push({ name, metadata: verified.file, lexical: entry.file })
  }
  for (const [name, entry] of generated.components) components.set(name, entry)
  for (const [name, entry] of lexical.components) {
    const verified = components.get(name)
    if (!verified) components.set(name, entry)
    else if (verified.file !== entry.file) pathMismatches.push({ name, metadata: verified.file, lexical: entry.file })
  }
  return {
    symbols,
    components,
    collisions: lexical.collisions,
    packageSymbols: generated.packageSymbols,
    packageComponents: generated.packageComponents,
    source: generated.present ? 'nuxt-metadata+lexical' : 'lexical',
    metadata: { present: generated.present, files: generated.files, mtime: generated.mtime, stale: generated.stale, pathMismatches, verifiedSymbols: generated.symbols.size, verifiedComponents: generated.components.size, newestSourceMtime: null, olderThanSources: false },
  }
}

function camelCase(name) {
  const parts = splitByCase(name)
  return parts.map((p, i) => (i === 0 ? p[0].toLowerCase() + p.slice(1) : p[0].toUpperCase() + p.slice(1))).join('')
}

// ---- Domain classification --------------------------------------------------------------------

const SHARED_UI_DIRS = new Set(['ui', 'base', 'common', 'shared', 'layout', 'app', 'global', 'icons', 'primitives', 'core'])
const SHARED_DIRS = new Set(['composables', 'utils', 'stores', 'store', 'types', 'lib', 'shared', 'hooks', 'services', 'api', 'helpers', 'constants', 'config', 'schemas', 'models', 'graphql', 'generated', 'locales', 'i18n'])
const SHELL_DIRS = new Set(['layouts', 'middleware', 'plugins', 'providers', 'router', 'assets', 'public', 'styles', 'css', 'error'])
const SHELL_FILES = new Set(['app.vue', 'error.vue', 'app.config.ts', 'proxy.ts', 'middleware.ts', 'main.ts', 'main.tsx', 'App.vue', 'App.tsx', 'router.ts', 'instrumentation.ts', 'instrumentation-client.ts'])
const SECTION_DIRS = new Set(['app', 'dashboard', 'admin', 'panel', 'portal', 'console', 'backoffice', 'private', 'protected', 'public'])
const AUTH_NAMES = new Set(['auth', 'login', 'logout', 'register', 'signup', 'signin', 'callback', 'oauth', 'sso', 'password', 'forgot-password', 'reset-password'])
const NEXT_SPECIAL = new Set(['layout', 'page', 'loading', 'error', 'not-found', 'global-error', 'template', 'default', 'route', 'opengraph-image', 'sitemap', 'robots', 'manifest', 'icon', 'apple-icon'])

export function isTestFile(relPath) {
  return /(^|\/)(tests?|e2e|__tests__|__mocks__|cypress|playwright)\//.test(relPath) || /\.(spec|test|stories|cy)\.[cm]?[jt]sx?$/.test(relPath)
}

/**
 * Classifies a file: { domain, kind: 'domain'|'shell'|'shared'|'server'|'test'|'other', classified }.
 * Config globs win; otherwise the directory conventions of Nuxt and Next.js apply.
 */
export function classify(project, relPath) {
  const { config } = project
  if (config.excludeTests !== false && isTestFile(relPath)) return { domain: 'test', kind: 'test', classified: true }
  for (const { domain, res } of config.domainMatchers) if (res.some((r) => r.test(relPath))) return { domain, kind: 'domain', classified: true }
  if (config.shellRes.some((r) => r.test(relPath))) return { domain: 'shell', kind: 'shell', classified: true }
  if (config.sharedRes.some((r) => r.test(relPath))) return { domain: 'shared', kind: 'shared', classified: true }

  let q = relPath
  const src = project.srcDir
  if (src !== '.' && q.startsWith(`${src}/`)) q = q.slice(src.length + 1)
  const layer = /^layers\/([^/]+)\/(?:app\/)?(.*)$/.exec(q)
  if (layer) q = layer[2]
  const segments = q.split('/')
  const first = segments[0]
  const file = segments[segments.length - 1]
  const stem = file.replace(/\.[^.]+$/, '').split('.')[0]

  if (segments.length === 1 && SHELL_FILES.has(file)) return { domain: 'shell', kind: 'shell', classified: true }
  if (segments.length === 1) return { domain: 'other', kind: 'other', classified: false }

  switch (first) {
    case 'features':
    case 'modules':
    case 'domains':
    case 'modulos':
    case 'dominios':
    case 'slices':
      return segments.length > 2
        ? { domain: segments[1].toLowerCase(), kind: 'domain', classified: true }
        : { domain: 'shared', kind: 'shared', classified: false }
    case 'components': {
      if (segments.length === 2) return { domain: 'shared', kind: 'shared', classified: false }
      const sub = segments[1].toLowerCase()
      if (SHARED_UI_DIRS.has(sub)) return { domain: 'shared', kind: 'shared', classified: true }
      if (sub === 'shell') return { domain: 'shell', kind: 'shell', classified: true }
      return { domain: sub, kind: 'domain', classified: true }
    }
    case 'pages': {
      let segs = segments.slice(1).filter((s) => !/^\(.*\)$/.test(s))
      if (segs.length > 2 && SECTION_DIRS.has(segs[0].toLowerCase())) segs = segs.slice(1)
      const head = segs.length > 1 ? segs[0] : stem
      if (segs.length === 1 && (stem === 'index' || /^\[.*\]$/.test(stem))) return { domain: 'shell', kind: 'shell', classified: true }
      if (AUTH_NAMES.has(head.toLowerCase())) return { domain: 'auth', kind: 'domain', classified: true }
      return { domain: head.toLowerCase(), kind: 'domain', classified: true }
    }
    case 'app': {
      // Next.js App Router (src/app) or a Nuxt 3 project without srcDir
      let segs = segments.slice(1).filter((s) => !/^\(.*\)$/.test(s) && !/^@/.test(s))
      if (segs.length > 2 && SECTION_DIRS.has(segs[0].toLowerCase())) segs = segs.slice(1)
      if (segs.length <= 1) return { domain: 'shell', kind: 'shell', classified: true }
      const head = segs[0]
      if (NEXT_SPECIAL.has(head)) return { domain: 'shell', kind: 'shell', classified: true }
      if (head === 'api') return segs.length > 2 ? { domain: segs[1].toLowerCase(), kind: 'domain', classified: true } : { domain: 'shell', kind: 'shell', classified: true }
      if (AUTH_NAMES.has(head.toLowerCase())) return { domain: 'auth', kind: 'domain', classified: true }
      return { domain: head.toLowerCase(), kind: 'domain', classified: true }
    }
    case 'server': {
      if ((segments[1] === 'api' || segments[1] === 'routes') && segments.length > 3) return { domain: segments[2].toLowerCase(), kind: 'domain', classified: true }
      return { domain: 'server', kind: 'server', classified: true }
    }
    default:
      if (SHELL_DIRS.has(first)) return { domain: 'shell', kind: 'shell', classified: true }
      if (SHARED_DIRS.has(first)) return { domain: 'shared', kind: 'shared', classified: false }
      return { domain: 'other', kind: 'other', classified: false }
  }
}

/** Source files of the project worth analyzing (excludes build output, declarations and, by default, tests). */
export function sourceFiles(project) {
  return walk(project.root)
    .map((abs) => ({ abs, rel: rel(project.root, abs) }))
    .filter(({ rel: r }) => !r.endsWith('.d.ts') && !/(^|\/)(nuxt|next|vite|vitest|playwright|eslint|tailwind|postcss)\.config\.[cm]?[jt]s$/.test(r))
    .filter(({ rel: r }) => !(project.config.excludeTests !== false && isTestFile(r)))
}

/**
 * Resolves an import specifier to a project-relative file path when it points inside the
 * project (`~/`, `@/`, `~~/`, `#imports` excluded, relative paths, `src/...`). Returns null for packages.
 */
export function resolveImport(project, fromRel, specifier) {
  const { root, srcDir } = project
  let target = null
  if (specifier.startsWith('~~/') || specifier.startsWith('@@/')) target = specifier.slice(3)
  else if (specifier.startsWith('~/') || specifier.startsWith('@/')) target = `${srcDir === '.' ? '' : `${srcDir}/`}${specifier.slice(2)}`
  else if (specifier.startsWith('#shared/')) target = `shared/${specifier.slice(8)}`
  else if (specifier.startsWith('#server/')) target = `server/${specifier.slice(8)}`
  else if (specifier.startsWith('./') || specifier.startsWith('../')) target = normalizePath(join(dirname(fromRel), specifier))
  else if (specifier.startsWith('src/') || specifier.startsWith('app/')) target = specifier
  else if (specifier.startsWith('#')) return null
  else return null
  target = target.replace(/^\.\//, '')
  const candidates = [target, ...['.ts', '.tsx', '.vue', '.js', '.jsx', '.mts', '.mjs'].map((e) => `${target}${e}`), ...['index.ts', 'index.tsx', 'index.js', 'index.vue'].map((i) => `${target}/${i}`)]
  for (const c of candidates) {
    const abs = join(root, c)
    if (exists(abs) && !isDirectory(abs)) return c
  }
  return null
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function normalizePath(p) {
  const parts = []
  for (const seg of p.split(/[\\/]+/)) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}
