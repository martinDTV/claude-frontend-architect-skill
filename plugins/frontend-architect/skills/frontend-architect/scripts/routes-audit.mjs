#!/usr/bin/env node
// Inventories routes and the guards around them. Nuxt: pages, definePageMeta middleware, global
// middleware, layouts. Next.js: App Router segments, proxy/middleware matcher, Server Actions and
// Route Handlers without a visible authorization check. Client-side guards are UX: this tool
// never says a route is "secure", only whether a guard is declared. Read-only.
//
// Usage: routes-audit.mjs <project-root> [--config file] [--json|--md] [--fail-on confirmed|any|none]
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildGraph } from './lib/graph.mjs'
import { detectProject, excludeArg, loadConfig } from './lib/project.mjs'
import { ENGINE_HELP, addFinding, createReport, engineOptionsFrom, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'
import { lineOf, stripComments } from './lib/source.mjs'

// Pages treated as public without a guard when the config names none: generic auth and error routes only.
// Project-specific public pages belong in `publicRoutes` of .frontend-audit.json.
const DEFAULT_PUBLIC_ROUTE_RE = /^\/(?:auth|login|logout|register|signup|signin|sign-in|sign-up|callback|forgot-password|reset-password|verify-email|forbidden|no-access|unauthorized|suspended|maintenance|error|403|404|500)(?:\/|$)/

const HELP = `
routes-audit — routes, guards, Server Actions and handlers.

usage: node routes-audit.mjs <project-root> [options]
  --config <file>     .frontend-audit.json with publicRoutes [globs] and authPatterns [strings]
  --exclude <globs>   comma-separated project-relative globs to leave out (also "exclude" in .frontend-audit.json)
  --json | --md       output format
  --fail-on <level>   exit 1 on: confirmed (default) | any | none${ENGINE_HELP}

Findings:
  page-without-guard            Nuxt page with no page middleware and no global auth middleware (heuristic)
  redirect-page                 Nuxt page that only redirects (definePageMeta redirect or a navigateTo-only script); info,
                                medium when the destination has no guard either
  unknown-middleware            a page names a middleware that does not exist in middleware/ (confirmed)
  hardcoded-role-check          literal role comparisons in UI code (heuristic)
  client-boundary-too-high      'use client' at the top of a Next.js page or layout (confirmed)
  server-action-without-auth    exported Server Action with no visible session/authorization call (heuristic, high)
  server-action-without-validation  Server Action that never validates its input (heuristic)
  route-handler-without-auth    mutating Route Handler with no visible auth or signature check (heuristic)
  proxy-matcher-gap             protected-looking route segment not covered by the proxy matcher (heuristic)
`

const AUTH_RE_BASE = /\b(?:auth|getSession|getServerSession|verifySession|requireUser|requireAuth|requireSession|currentUser|getUser|getCurrentUser|session|authorize|authorized|can\(|assert\w*(?:Auth|Session|Permission|Role)|checkPermission|hasPermission|validateRequest|verifyToken|verifyJwt|createHmac|timingSafeEqual|verifySignature|constructEvent)\b/

function nuxtRoutePath(relFromPages) {
  const noExt = relFromPages.replace(/\.vue$/, '')
  const parts = noExt.split('/').filter((p) => !/^\(.*\)$/.test(p))
  if (parts[parts.length - 1] === 'index') parts.pop()
  const path = `/${parts.map((p) => p.replace(/\[\.\.\.(\w+)\]/, '*').replace(/\[(\w+)\]/g, ':$1')).join('/')}`
  return path === '/' ? '/' : path.replace(/\/$/, '')
}

function nextRoutePath(relFromApp) {
  const parts = relFromApp.split('/').slice(0, -1).filter((p) => !/^\(.*\)$/.test(p) && !/^@/.test(p))
  const path = `/${parts.map((p) => p.replace(/\[\.\.\.(\w+)\]/, '*').replace(/\[(\w+)\]/g, ':$1')).join('/')}`
  return path === '/' ? '/' : path.replace(/\/$/, '')
}

/**
 * definePageMeta({...}) read from the TypeScript AST when the parser is available (comments, nested
 * arrays, identifiers and spreads handled), otherwise from the comment-stripped script with regexes.
 * Returns { middleware: [names], middlewareUnknown (identifiers/spreads/functions), layout, auth, redirect, parser }.
 */
function parsePageMeta(info, ts) {
  const code = stripComments(info.code)
  if (ts && info.semantic) {
    try {
      const meta = parsePageMetaAst(ts, info)
      if (meta) return meta
    } catch {
      /* fall back to the lexical parser */
    }
  }
  const block = /definePageMeta\s*\(\s*\{([\s\S]*?)\}\s*\)/.exec(code)?.[1]
  if (block === undefined) return null
  const meta = { middleware: [], middlewareUnknown: [], layout: null, auth: null, redirect: null, raw: block.trim(), parser: 'lexical' }
  const mw = /\bmiddleware\s*:\s*(\[[^\]]*\]|['"][^'"]+['"]|[\w$]+)/.exec(block)
  if (mw) {
    const names = [...mw[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    meta.middleware = names
    if (!names.length) meta.middlewareUnknown = [mw[1].startsWith('[') ? 'inline' : mw[1]]
  }
  meta.layout = /\blayout\s*:\s*['"]([^'"]+)['"]/.exec(block)?.[1] ?? (/\blayout\s*:\s*false/.test(block) ? 'false' : null)
  const auth = /\b(?:auth|requiresAuth|public)\s*:\s*(true|false|\{[^}]*\})/.exec(block)
  if (auth) meta.auth = auth[0]
  meta.redirect = /\bredirect\s*:\s*['"]([^'"]+)['"]/.exec(block)?.[1] ?? null
  return meta
}

function parsePageMetaAst(ts, info) {
  const lang = info.semantic.sfc?.lang ?? 'ts'
  const sf = ts.createSourceFile(`${info.rel}.${lang === 'ts' ? 'ts' : 'js'}`, info.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let call = null
  const find = (n) => {
    if (call) return
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'definePageMeta') call = n
    else ts.forEachChild(n, find)
  }
  find(sf)
  if (!call) return null
  const obj = call.arguments[0]
  if (!obj || !ts.isObjectLiteralExpression(obj)) return { middleware: [], middlewareUnknown: ['non-literal'], layout: null, auth: null, redirect: null, raw: obj ? obj.getText(sf).slice(0, 120) : '', parser: 'ast' }
  const meta = { middleware: [], middlewareUnknown: [], layout: null, auth: null, redirect: null, raw: obj.getText(sf).slice(0, 400), parser: 'ast' }
  const literal = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null)
  for (const prop of obj.properties) {
    const key = prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : null
    if (!key) continue
    const value = ts.isPropertyAssignment(prop) ? prop.initializer : ts.isShorthandPropertyAssignment(prop) ? prop.name : null
    if (key === 'middleware') {
      const items = value && ts.isArrayLiteralExpression(value) ? value.elements : value ? [value] : []
      for (const el of items) {
        const name = literal(el)
        if (name) meta.middleware.push(name)
        else if (ts.isArrowFunction(el) || ts.isFunctionExpression(el)) meta.middlewareUnknown.push('inline')
        else meta.middlewareUnknown.push(el.getText(sf).slice(0, 40))
      }
    } else if (key === 'layout') meta.layout = literal(value) ?? (value && value.kind === ts.SyntaxKind.FalseKeyword ? 'false' : null)
    else if (key === 'redirect') meta.redirect = literal(value) ?? (value ? '(dynamic)' : null)
    else if (['auth', 'requiresAuth', 'public'].includes(key)) meta.auth = `${key}: ${value ? value.getText(sf).slice(0, 60) : ''}`
  }
  return meta
}

/** A page whose script does nothing but redirect (navigateTo / router.replace / router.push) and has no real template. */
function redirectOnlyTarget(info) {
  const code = stripComments(info.code).trim()
  if (!code) return null
  const statements = code.split('\n').map((l) => l.trim()).filter((l) => l && !/^definePageMeta\s*\(/.test(l) && !/^(?:import\s|const\s+router\s*=\s*useRouter\(\)|const\s+route\s*=\s*useRoute\(\))/.test(l) && !/^[})\],;]*$/.test(l))
  if (!statements.length) return null
  const re = /^(?:return\s+|await\s+)?(?:navigateTo|router\.(?:replace|push))\s*\(\s*(['"])([^'"]+)\1/
  const m = re.exec(statements[0])
  if (!m || statements.length > 1) return null
  const templateEmpty = !info.template || !info.template.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?template[^>]*>/g, '').trim()
  return templateEmpty ? m[2] : null
}

function functionBody(stripped, startIndex) {
  const open = stripped.indexOf('{', startIndex)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++
    else if (stripped[i] === '}') {
      depth--
      if (depth === 0) return stripped.slice(open, i + 1)
    }
  }
  return stripped.slice(open)
}

export function run(argv) {
  const args = parseArgs(argv)
  if (args.help || !args._[0]) return usage(HELP)
  const root = resolve(args._[0])
  if (!existsSync(join(root, 'package.json'))) return fail(`no package.json in ${root}`)
  let config
  try {
    config = loadConfig(root, args.config, { exclude: excludeArg(args) })
  } catch (error) {
    return fail(error.message)
  }
  const project = detectProject(root, config)
  const report = createReport('routes-audit', project)
  const authRe = config.authPatterns?.length ? new RegExp(`${AUTH_RE_BASE.source}|${config.authPatterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}`) : AUTH_RE_BASE
  let graph
  try {
    graph = buildGraph(project, { autoImports: false, ...engineOptionsFrom(args) })
  } catch (error) {
    return fail(error.message)
  }
  const infos = [...graph.files.values()]
  report.analysis = graph.analysis
  const tsApi = graph.host?.ts ?? null
  const hasDirective = (info, name) => (info.semantic ? info.semantic.directives.includes(name) : new RegExp(`^\\s*['"]${name}['"]`).test(info.code))
  const sections = []

  // Fixed role checks (both frameworks)
  for (const info of infos) {
    for (const m of info.stripped.matchAll(/\b(?:rol|role|roles|perfil|profile)\b[^;\n]{0,40}?(?:===|==|!==|!=|includes\s*\()\s*(['"])([\w-]+)\1/g)) {
      const literal = info.code.slice(m.index, m.index + m[0].length + 40).match(/(?:===|==|!==|!=|includes\s*\()\s*['"]([\w-]+)['"]/)?.[1] ?? m[2]
      if (!literal || /^(?:undefined|null|true|false)$/.test(literal)) continue
      addFinding(report, { id: 'hardcoded-role-check', level: 'heuristic', severity: 'low', file: info.rel, line: lineOf(info.stripped, m.index) + (info.isVue ? info.scriptLine : 0), message: `literal role check ('${literal}') in UI code`, fix: 'read permissions from the server-provided matrix (can(action)); the backend enforces; literal roles rot when roles change' })
    }
  }

  if (project.framework === 'nuxt') {
    const pagesDir = `${project.srcDir === '.' ? '' : `${project.srcDir}/`}pages/`
    const middlewareDir = `${project.srcDir === '.' ? '' : `${project.srcDir}/`}middleware/`
    const globalMiddleware = infos.filter((i) => i.rel.startsWith(middlewareDir) && /\.global\.[cm]?[jt]s$/.test(i.rel)).map((i) => ({ file: i.rel, name: i.rel.slice(middlewareDir.length).replace(/\.global\.[cm]?[jt]s$/, ''), authLike: /auth|session|guard|login|permis|protect/i.test(i.rel.split('/').pop()) || (/\b(?:navigateTo|abortNavigation)\b/.test(i.stripped) && /\b(?:user|session|token|auth|logged|isAuthenticated)\b/i.test(i.stripped)) }))
    const namedMiddleware = infos.filter((i) => i.rel.startsWith(middlewareDir) && !/\.global\./.test(i.rel)).map((i) => i.rel.slice(middlewareDir.length).replace(/\.[cm]?[jt]s$/, ''))
    const addRouteGlobal = infos.some((i) => /addRouteMiddleware\s*\([^)]*global\s*:\s*true/.test(i.stripped))
    const globalAuth = globalMiddleware.some((g) => g.authLike) || addRouteGlobal

    const pages = []
    const pageInfos = infos.filter((i) => i.rel.startsWith(pagesDir) && i.rel.endsWith('.vue'))
    const pathOf = new Map(pageInfos.map((i) => [nuxtRoutePath(i.rel.slice(pagesDir.length)), i.rel]))
    const metaByFile = new Map()
    for (const info of pageInfos) metaByFile.set(info.rel, parsePageMeta(info, tsApi))
    const guardedFile = (rel) => {
      const m = metaByFile.get(rel)
      return Boolean(m && (m.middleware.length || m.middlewareUnknown.length || (m.auth && !/false|public\s*:\s*true/.test(m.auth))))
    }
    for (const info of pageInfos) {
      const fromPages = info.rel.slice(pagesDir.length)
      const path = nuxtRoutePath(fromPages)
      const meta = metaByFile.get(info.rel)
      const isPublic = config.publicRouteRes.some((r) => r.test(info.rel)) || DEFAULT_PUBLIC_ROUTE_RE.test(path)
      const middleware = meta?.middleware ?? []
      const unknownMw = meta?.middlewareUnknown ?? []
      // D1 (1.4): redirect-only pages (definePageMeta redirect, or a script that only calls navigateTo) carry no guard of their own
      const redirectTo = meta?.redirect ?? redirectOnlyTarget(info)
      const guarded = middleware.length > 0 || unknownMw.length > 0 || globalAuth || (meta?.auth && !/false|public\s*:\s*true/.test(meta.auth))
      let status = isPublic ? 'public' : guarded ? (middleware.length || unknownMw.length ? 'guarded' : 'global') : 'unguarded'
      let redirectGuarded = null
      if (status === 'unguarded' && redirectTo) {
        status = 'redirect'
        const targetPath = redirectTo.split('?')[0].replace(/\/$/, '') || '/'
        const targetFile = pathOf.get(targetPath) ?? [...pathOf.entries()].find(([p]) => p.includes(':') && new RegExp(`^${p.replace(/:[^/]+/g, '[^/]+')}$`).test(targetPath))?.[1] ?? null
        redirectGuarded = targetFile ? guardedFile(targetFile) || globalAuth : null
      }
      pages.push({ path, file: info.rel, middleware: [...middleware, ...unknownMw.map((u) => (u === 'inline' ? 'inline' : `(${u})`))], layout: meta?.layout ?? 'default', meta: Boolean(meta), metaParser: meta?.parser ?? null, status, redirectTo: redirectTo ?? null, redirectGuarded })
      if (status === 'unguarded') {
        addFinding(report, { id: 'page-without-guard', level: 'heuristic', severity: 'medium', file: info.rel, message: `${path}: no page middleware and no global auth middleware`, fix: "add middleware: 'auth' (or a global guard with an allowlist of public routes); authorization itself stays in the backend" })
      } else if (status === 'redirect') {
        addFinding(report, { id: 'redirect-page', level: 'info', severity: redirectGuarded === false ? 'medium' : 'info', file: info.rel, message: `${path} only redirects to ${redirectTo}${redirectGuarded === true ? ' (a guarded page)' : redirectGuarded === false ? ' (a page without a guard)' : ' (target not found among the pages)'}`, fix: redirectGuarded === false ? 'guard the destination, or remove the legacy page' : 'legacy entry point: delete it when the old links are gone' })
      }
    }
    const inconsistent = [...new Set(pages.flatMap((p) => p.middleware))].filter((m) => !namedMiddleware.includes(m) && m !== 'inline' && !m.startsWith('('))
    if (inconsistent.length) addFinding(report, { id: 'unknown-middleware', level: 'confirmed', severity: 'medium', message: `pages reference middleware not found in ${middlewareDir}: ${inconsistent.join(', ')}`, fix: 'check the names; Nuxt fails at runtime when a named middleware does not exist' })

    report.summary = { pages: pages.length, guarded: pages.filter((p) => p.status === 'guarded').length, byGlobal: pages.filter((p) => p.status === 'global').length, public: pages.filter((p) => p.status === 'public').length, unguarded: pages.filter((p) => p.status === 'unguarded').length, redirects: pages.filter((p) => p.status === 'redirect').length, metaParser: tsApi ? 'ast' : 'lexical', globalMiddleware: globalMiddleware.map((g) => g.name).join(', ') || 'none', namedMiddleware: namedMiddleware.join(', ') || 'none', ssr: project.nuxt.ssr, routeRulesSsrFalse: project.nuxt.routeRulesSsrFalse.join(', ') || '-' }
    report.data = { pages, globalMiddleware, namedMiddleware }
    sections.push({ title: 'Pages', table: { headers: ['route', 'status', 'middleware', 'layout', 'file'], rows: pages.sort((a, b) => a.path.localeCompare(b.path)).map((p) => [p.path, p.status, p.middleware.join(',') || '-', p.layout, p.file]) } })
  }

  if (project.framework === 'next') {
    const appDir = project.next.appDir ? `${project.next.appDir}/` : null
    const routes = []
    const matcherPatterns = []
    if (project.next.proxyFile) {
      const proxy = infos.find((i) => i.rel === project.next.proxyFile)
      if (proxy) for (const m of proxy.code.matchAll(/matcher\s*:\s*(\[[^\]]*\]|['"][^'"]+['"])/g)) for (const p of m[1].matchAll(/['"]([^'"]+)['"]/g)) matcherPatterns.push(p[1])
    }
    const covered = (path) => matcherPatterns.some((p) => {
      const prefix = p.split('/:')[0].replace(/\(.*$/, '')
      return path === prefix || path.startsWith(`${prefix}/`) || p === '/(.*)' || p === '/:path*'
    })
    if (appDir) {
      for (const info of infos) {
        if (!info.rel.startsWith(appDir)) continue
        const fromApp = info.rel.slice(appDir.length)
        const file = fromApp.split('/').pop()
        const kind = file.replace(/\.[jt]sx?$/, '')
        if (!['page', 'layout', 'route', 'loading', 'error', 'template', 'default', 'not-found'].includes(kind)) continue
        const path = nextRoutePath(fromApp)
        const useClient = hasDirective(info, 'use client')
        routes.push({ path, kind, file: info.rel, useClient, covered: covered(path) })
        if (useClient && (kind === 'page' || kind === 'layout')) {
          addFinding(report, { id: 'client-boundary-too-high', level: 'confirmed', severity: kind === 'layout' ? 'high' : 'medium', file: info.rel, line: 1, message: `'use client' at the top of ${kind} ${path}: the whole subtree ships and renders as client JavaScript`, fix: 'keep the page/layout as a Server Component and move interactivity into small client leaves' })
        }
        if (kind === 'route') {
          for (const m of info.stripped.matchAll(/export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\s*\(/g)) {
            const body = functionBody(info.stripped, m.index)
            if (!authRe.test(body)) addFinding(report, { id: 'route-handler-without-auth', level: 'heuristic', severity: 'medium', file: info.rel, line: lineOf(info.stripped, m.index), message: `${m[1]} ${path}: no visible session, authorization or signature check in the handler`, fix: 'verify the session or the webhook signature at the top of the handler; the matcher in proxy.ts is not authorization' })
          }
        }
      }
    }
    // Server Actions: file-level 'use server'
    const actions = []
    for (const info of infos) {
      const fileLevel = hasDirective(info, 'use server')
      const inline = [...info.stripped.matchAll(/(?:async\s+)?function\s+([\w$]+)\s*\([^)]*\)\s*\{\s*['"]use server['"]/g)]
      if (!fileLevel && !inline.length) continue
      const exported = fileLevel ? [...info.stripped.matchAll(/export\s+(?:async\s+)?function\s+([\w$]+)\s*\(|export\s+const\s+([\w$]+)\s*=\s*(?:async\s*)?\(/g)] : inline
      for (const m of exported) {
        const name = m[1] ?? m[2]
        const body = functionBody(info.stripped, m.index)
        const hasAuth = authRe.test(body)
        const hasValidation = /\b(?:safeParse|\.parse\s*\(|parseAsync|schema|z\.|v\.|valibot|yup|validate)\b/.test(body)
        actions.push({ name, file: info.rel, hasAuth, hasValidation })
        const line = lineOf(info.stripped, m.index)
        if (!hasAuth) addFinding(report, { id: 'server-action-without-auth', level: 'heuristic', severity: 'high', file: info.rel, line, message: `Server Action ${name}() has no visible session or authorization check: it is a public HTTP endpoint`, fix: 'read the session (cookies()) and check the permission for the specific resource inside the action before touching data' })
        if (!hasValidation) addFinding(report, { id: 'server-action-without-validation', level: 'heuristic', severity: 'medium', file: info.rel, line, message: `Server Action ${name}() never validates its input`, fix: 'parse FormData/arguments with a schema (Zod/Valibot) and return field errors' })
      }
    }
    const protectedLooking = routes.filter((r) => r.kind === 'page' && /^\/(?:dashboard|admin|app|account|settings|panel|portal)(?:\/|$)/.test(r.path) && !r.covered)
    for (const r of protectedLooking) addFinding(report, { id: 'proxy-matcher-gap', level: 'heuristic', severity: 'low', file: r.file, message: `${r.path} looks private but the proxy matcher (${matcherPatterns.join(', ') || 'none'}) does not cover it`, fix: 'the matcher is only a UX gate; still, keep it consistent, and check the session in the Server Component that renders protected data' })

    report.summary = { routeFiles: routes.length, pages: routes.filter((r) => r.kind === 'page').length, handlers: routes.filter((r) => r.kind === 'route').length, serverActions: actions.length, actionsWithoutAuth: actions.filter((a) => !a.hasAuth).length, proxy: project.next.proxyFile ?? 'none', matcher: matcherPatterns.join(', ') || '-' }
    report.data = { routes, actions, matcherPatterns }
    sections.push({ title: 'App Router files', table: { headers: ['route', 'kind', 'use client', 'proxy', 'file'], rows: routes.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind)).map((r) => [r.path, r.kind, r.useClient ? 'yes' : '', r.covered ? 'matched' : '', r.file]) } })
    if (actions.length) sections.push({ title: 'Server Actions', table: { headers: ['action', 'auth check', 'validation', 'file'], rows: actions.map((a) => [a.name, a.hasAuth ? 'yes' : 'NO', a.hasValidation ? 'yes' : 'NO', a.file]) } })
  }

  if (project.framework !== 'nuxt' && project.framework !== 'next') report.notes.push('route inventory is implemented for Nuxt and Next.js; only role-check findings apply to this project')
  report.notes.push('Guards and matchers are UX gates. Authorization is enforced by the backend, Server Functions, Route Handlers and Nitro routes; this report cannot prove that.')
  return finish(report, args, { sections })
}

// Set the exit code instead of calling process.exit: large --json outputs piped to another process
// would otherwise be truncated at 64 KiB when the process exits before stdout drains.
if (isMainModule(import.meta.url)) process.exitCode = run(process.argv.slice(2))
