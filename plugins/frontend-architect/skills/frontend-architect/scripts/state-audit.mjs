#!/usr/bin/env node
// Audits where state lives: stores shared by too many domains, server data copied into stores,
// raw Nuxt useState keys, tokens in web storage, module-level mutable state that leaks across
// SSR requests, and logout paths that do not clear caches. Read-only.
//
// Usage: state-audit.mjs <project-root> [--config file] [--json|--md] [--fail-on confirmed|any|none]
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildGraph } from './lib/graph.mjs'
import { detectProject, excludeArg, loadConfig } from './lib/project.mjs'
import { ENGINE_HELP, addFinding, createReport, engineOptionsFrom, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'
import { countMatches, findIdentifier, topLevelStatements } from './lib/source.mjs'

const HELP = `
state-audit — where state lives and which placements are risky.

usage: node state-audit.mjs <project-root> [options]
  --config <file>     classification file (default: .frontend-audit.json)
  --exclude <globs>   comma-separated project-relative globs to leave out (also "exclude" in .frontend-audit.json)
  --json | --md       output format
  --fail-on <level>   exit 1 on: confirmed (default) | any | none${ENGINE_HELP}

Findings:
  token-in-web-storage                 localStorage/sessionStorage/cookie writes of tokens or secrets (confirmed)
  module-level-http-client-mutable-auth  a module-level HTTP instance whose auth header is mutated (confirmed pattern)
  module-level-mutable-state           let/Map/ref/… at module scope in code that runs on the server (heuristic)
  server-data-in-store                 a store that fetches and keeps entity arrays (heuristic)
  server-data-copied-to-store          a component/composable that fetches (query cache or HTTP) and writes the result into a store (heuristic)
  store-shared-across-domains          a non-core store used by three or more business domains (heuristic)
  store-persists-everything            persist: true on a whole store (heuristic; high if it holds tokens)
  god-store                            a store returning many members or very long (heuristic)
  raw-state-key-shared                 a useState('key') literal repeated across files/domains (heuristic)
  logout-without-cache-clear           a logout function that does not visibly clear query caches or state (heuristic)
  module-level-client-store            Zustand/Redux store created at module scope in a Next.js app (info)
  browser-api-in-setup                 window/document/localStorage/navigator… evaluated during server rendering: setup top level
                                       or module scope in a Nuxt app with SSR, the render body of a React component (confirmed in
                                       Nuxt setup/module scope; heuristic elsewhere; nothing when guarded by import.meta.client,
                                       typeof window, onMounted/useEffect, an event handler or a .client file) (1.4, semantic engine)
  nondeterministic-render              Date.now / Math.random / crypto.randomUUID evaluated during render: the server and the client
                                       disagree (hydration mismatch) (heuristic; nothing inside onMounted/useEffect or guards) (1.4)
`

const HTTP_RE = /(?:\$fetch|useFetch|useLazyFetch|useAsyncData|apiFetch|fetch)\s*\(|\b(?:\$?api|http|axios|client|request)\.(?:get|post|put|patch|delete|request)\s*\(/g
const QUERY_RE = /\b(?:useQuery|useInfiniteQuery|useFetch|useLazyFetch|useAsyncData|useLazyAsyncData|\$fetch|apiFetch)\s*\(|\b(?:\$?api|http|axios|client|request)\.(?:get|post|put|patch|delete)\s*\(/g
const DATA_WORD_RE = /\b(?:data|response|result|results|res|items|rows|payload|json|records|list|page|body|await)\b/i
const LITERAL_RHS_RE = /^(?:true|false|null|undefined|\[\s*\]|\{\s*\}|''|""|``|-?\d+(?:\.\d+)?)\s*$/
const SECRET_RE = /token|jwt|access|refresh|secret|password|bearer|session|credential|api[-_]?key/i
const CONTAINER_RE = /^(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(new\s+(?:Map|Set|WeakMap|WeakSet)\b|\[\s*\]|\{\s*\}|(?:ref|reactive|shallowRef|shallowReactive)\s*(?:<[^>]*>)?\s*\(|axios\.create\s*\(|\$fetch\.create\s*\(|ofetch\.create\s*\(|createHttpClient\s*\(|new\s+(?:QueryClient|EventEmitter|AbortController)\b)/
const MUTABLE_BINDING_RE = /^(?:export\s+)?(?:let|var)\s+([\w$]+)/
const EXCLUDE_TOP_RE = /^(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*(?::[^=]+)?=\s*(?:defineStore|defineNuxtPlugin|defineEventHandler|defineNuxtRouteMiddleware|defineNuxtConfig|defineAppConfig|defineComponent|createGlobalState|createSharedComposable|z\.|v\.|object\(|import\.meta|process\.env|Symbol\(|\d|['"`]|true|false|null)/

function isClientOnly(rel, code) {
  return /\.client\.[cm]?[jt]sx?$|\.client\.vue$/.test(rel) || /^\s*['"]use client['"]/.test(code)
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
  const report = createReport('state-audit', project)
  let graph
  try {
    graph = buildGraph(project, engineOptionsFrom(args))
  } catch (error) {
    return fail(error.message)
  }
  const { files, edges, analysis } = graph
  report.analysis = analysis
  const coreStores = new Set((config.coreStores ?? []).map((s) => s.toLowerCase()))
  const ssrOff = project.nuxt ? project.nuxt.ssr === false : false
  const hasQueryCache = Boolean(project.deps['@pinia/colada'] || project.deps['@tanstack/vue-query'] || project.deps['@tanstack/react-query'])

  const stores = []
  const stateKeys = new Map()
  const storageKeys = []
  const moduleState = []

  for (const info of files.values()) {
    const { rel, code, stripped, classification } = info
    const business = classification.kind === 'domain'

    // ---- Pinia stores
    for (const m of stripped.matchAll(/(?:export\s+)?const\s+(use\w+)\s*=\s*defineStore\s*\(/g)) {
      const varName = m[1]
      const id = /defineStore\s*\(\s*['"]([^'"]+)['"]/.exec(code)?.[1] ?? varName
      const consumers = edges.filter((e) => e.to === rel && (e.via !== 'auto-import' || e.name === varName)).map((e) => e.from)
      const consumerFiles = [...new Set(consumers)]
      const domains = [...new Set(consumerFiles.map((f) => files.get(f)?.classification).filter((c) => c && c.kind === 'domain').map((c) => c.domain))].sort()
      const shellUse = consumerFiles.filter((f) => files.get(f)?.classification.kind === 'shell').length
      const http = countMatches(stripped, HTTP_RE)
      const entityArrays = countMatches(stripped, /\b(?:ref|shallowRef)\s*<\s*[\w.]+\[\]\s*>\s*\(|\bref\s*\(\s*\[\s*\]\s*\)|:\s*\[\]\s*(?:as\s+[\w.<>\[\]]+)?\s*,?$/gm)
      const persist = /\bpersist\s*:\s*true\b/.test(stripped) ? 'all' : /\bpersist\s*:\s*\{/.test(stripped) ? 'partial' : null
      const tokens = /\b(?:access|refresh|token|jwt|accessToken|refreshToken|idToken)\b/i.test(stripped)
      const returnBlock = [...stripped.matchAll(/return\s*\{([^}]*)\}/g)].pop()?.[1] ?? ''
      const members = returnBlock ? returnBlock.split(',').map((s) => s.trim()).filter(Boolean).length : countMatches(stripped, /^\s{4}[\w$]+\s*(?:\(|:)/gm)
      stores.push({ id, varName, file: rel, lines: info.lines, consumers: consumerFiles.length, domains, shellUse, http, entityArrays, persist, tokens, members })

      if (http > 0 && entityArrays > 0) {
        addFinding(report, { id: 'server-data-in-store', level: 'heuristic', severity: 'medium', file: rel, message: `store "${id}" fetches (${http} calls) and keeps entity arrays (${entityArrays}): server data belongs in a query cache (Pinia Colada / useFetch)`, fix: 'move fetching to a service + query composable; keep only client-owned state in the store' })
      }
      if (domains.length >= 3 && !coreStores.has(id.toLowerCase())) {
        addFinding(report, { id: 'store-shared-across-domains', level: 'heuristic', severity: 'medium', file: rel, message: `store "${id}" is used by ${domains.length} business domains (${domains.join(', ')})`, fix: 'either it is core state (add it to coreStores) or domains are coupling through a shared store; split it per owner and communicate through navigation, the backend or published contracts' })
      }
      if (persist === 'all') {
        addFinding(report, { id: 'store-persists-everything', level: 'heuristic', severity: tokens ? 'high' : 'medium', file: rel, message: `store "${id}" is persisted whole (persist: true)${tokens ? ' and holds token-like state' : ''}`, fix: 'persist only preferences with pick/partialize; never tokens or server data' })
      }
      if (members >= 15 || info.lines >= 300) {
        addFinding(report, { id: 'god-store', level: 'heuristic', severity: 'low', file: rel, message: `store "${id}" returns ${members} members in ${info.lines} lines`, fix: 'one store per business concern; derive values with computed instead of storing them' })
      }
    }

    // ---- Zustand / Redux at module scope (Next.js)
    if (project.framework === 'next') {
      for (const st of topLevelStatements(stripped)) {
        if (/^(?:export\s+)?const\s+[\w$]+\s*=\s*(?:create\s*(?:<[^>]*>)?\s*\(\s*\)\s*\(|create\s*\(|configureStore\s*\(|createStore\s*\()/.test(st.text)) {
          addFinding(report, { id: 'module-level-client-store', level: 'info', severity: 'low', file: rel, line: st.line, message: 'client store created at module scope: shared by all requests during SSR', fix: 'fine for client-only preferences; for per-user data create the store per request in a provider and pass server data as props' })
        }
      }
    }

    // ---- Nuxt useState keys
    if (project.framework === 'nuxt') {
      for (const m of stripped.matchAll(/\buseState\s*(?:<[^>]*>)?\s*\(\s*(['"])([^'"]*)\1\s*(,)?/g)) {
        const key = code.slice(m.index, m.index + m[0].length).match(/['"]([^'"]*)['"]/)?.[1] ?? m[2]
        if (!key) continue
        if (!stateKeys.has(key)) stateKeys.set(key, { key, files: new Set(), owners: new Set(), domains: new Set() })
        const entry = stateKeys.get(key)
        entry.files.add(rel)
        if (m[3]) entry.owners.add(rel)
        if (business) entry.domains.add(classification.domain)
      }
    }

    // ---- Web storage and cookies
    for (const m of code.matchAll(/\b(localStorage|sessionStorage)\.setItem\s*\(\s*(?:(['"`])([^'"`]*)\2|([\w$.[\]]+))\s*,\s*([^)]*)\)/g)) {
      const key = m[3] ?? m[4]
      const value = m[5]
      const sensitive = SECRET_RE.test(`${key} ${value}`) && !/theme|locale|lang|sidebar|collapsed|dismiss|onboard|cookie-consent/i.test(key)
      storageKeys.push({ storage: m[1], key, file: rel, sensitive })
      const testDouble = /(?:^|\/)(?:fake|mock|stub|dev-only|__mocks__|fixtures?)(?:[./-]|$)/i.test(rel) || /\b(?:fake|mock|stub)\b/i.test(key)
      if (sensitive) addFinding(report, { id: 'token-in-web-storage', level: 'confirmed', severity: testDouble ? 'low' : 'high', file: rel, line: lineAt(code, m.index), message: `${m[1]}.setItem('${key}', ${value.trim().slice(0, 40)}) stores a token or secret readable by any script (XSS)${testDouble ? ' (looks like a test double: confirm it never ships to production)' : ''}`, fix: 'use an HttpOnly, Secure, SameSite cookie session (or a BFF); if a token must live in the browser keep it in memory and document the risk in an ADR' })
    }
    for (const m of code.matchAll(/\b(useLocalStorage|useSessionStorage|useStorage)\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/g)) {
      const sensitive = SECRET_RE.test(m[2])
      storageKeys.push({ storage: m[1], key: m[2], file: rel, sensitive })
      if (sensitive) addFinding(report, { id: 'token-in-web-storage', level: 'confirmed', severity: 'high', file: rel, line: lineAt(code, m.index), message: `${m[1]}('${m[2]}') persists a token-like value in web storage`, fix: 'HttpOnly cookie session; never tokens in storage' })
    }
    for (const m of code.matchAll(/document\.cookie\s*=\s*([^;\n]*)/g)) {
      if (SECRET_RE.test(m[1])) addFinding(report, { id: 'token-in-web-storage', level: 'confirmed', severity: 'high', file: rel, line: lineAt(code, m.index), message: 'a token is written to document.cookie from JavaScript (not HttpOnly)', fix: 'the server sets the session cookie with HttpOnly; the browser never sees the token' })
    }

    // ---- Module-level mutable state (modules and non-setup script blocks)
    const moduleScope = !info.isVue || !info.setup
    if (moduleScope && info.code.trim()) {
      const clientOnly = isClientOnly(rel, code)
      const statements = topLevelStatements(stripped)
      for (const st of statements) {
        const binding = MUTABLE_BINDING_RE.exec(st.text)
        if (!binding && EXCLUDE_TOP_RE.test(st.text)) continue
        const container = !binding && CONTAINER_RE.exec(st.text)
        if (!container && !binding) continue
        const match = binding || container
        const name = match[1]
        const init = binding ? 'let/var' : container[2].trim()
        const mutated = new RegExp(`(?<![\\w$.])${name}(?:\\.(?:set|push|unshift|splice|delete|clear|add|defaults)\\b|\\.value\\s*=|\\s*=[^=]|\\[[^\\]]+\\]\\s*=)`).test(stripped.replace(st.text, ''))
        const httpClient = /axios\.create|\$fetch\.create|ofetch\.create|createHttpClient/.test(init)
        const authMutation = httpClient && /\.defaults\.headers|headers\.common|Authorization/.test(stripped)
        const line = st.line + (info.isVue ? info.scriptLine : 0)
        moduleState.push({ file: rel, line, name, init, mutated, clientOnly, httpClient })
        if (authMutation) {
          addFinding(report, {
            id: 'module-level-http-client-mutable-auth', level: 'confirmed', severity: ssrOff || clientOnly ? 'medium' : 'critical', file: rel, line,
            message: `module-level HTTP instance "${name}" with a mutable Authorization header${ssrOff ? ' (no cross-request leak while ssr: false, but blocks SSR and leaks on any server-side use)' : ': one user’s token can serve another user’s request during SSR'}`,
            fix: 'create the instance per request (Nuxt plugin, Next provider) and read the token/cookie per request; never mutate shared defaults',
          })
        } else {
          addFinding(report, {
            id: 'module-level-mutable-state', level: 'heuristic', severity: clientOnly ? 'low' : ssrOff ? 'low' : mutated ? 'high' : 'medium', file: rel, line,
            message: `module-level ${init.replace(/\s*\($/, '')} "${name}"${mutated ? ' is mutated' : ''}${clientOnly ? ' (client-only file)' : ssrOff ? ' (safe only while ssr: false)' : ': shared by every SSR request'}`,
            fix: 'keep per-user or per-request data in useState/Pinia/per-request providers; module-level is fine only for immutable config',
          })
        }
      }
    }

    // ---- server data copied from a fetch/query into a store (two sources of truth)
    if (!/\bdefineStore\s*\(/.test(stripped)) {
      const fetchLines = [...stripped.matchAll(QUERY_RE)].map((m) => lineAt(stripped, m.index))
      if (fetchLines.length) {
        const offset = info.isVue ? info.scriptLine - 1 : 0
        const lines = stripped.split('\n')
        const refsFromStore = new Set()
        for (const m of stripped.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*storeToRefs\s*\(/g)) for (const part of m[1].split(',')) {
          const name = part.split(':').pop()?.trim()
          if (name && /^[\w$]+$/.test(name)) refsFromStore.add(name)
        }
        const writes = []
        lines.forEach((text, i) => {
          const assign = /\b([\w$]*[sS]tore)\.([\w$]+)\s*=(?!=)\s*(.*)$/.exec(text)
          if (assign && !LITERAL_RHS_RE.test(assign[3].replace(/;\s*$/, '')) && DATA_WORD_RE.test(assign[3])) writes.push({ line: i + 1, text: text.trim(), kind: 'assignment' })
          const setter = /\b([\w$]*[sS]tore)\.((?:set|add|load|hydrate|replace|init|assign|fill|save|push|upsert|merge)[\w$]*)\s*\(([^)]*)\)/.exec(text)
          if (setter && DATA_WORD_RE.test(setter[3])) writes.push({ line: i + 1, text: text.trim(), kind: 'setter' })
          for (const ref of refsFromStore) {
            const re = new RegExp(`(?<![\\w$.])${ref}\\.value\\s*=(?!=)\\s*(.*)$`)
            const m = re.exec(text)
            if (m && !LITERAL_RHS_RE.test(m[1].replace(/;\s*$/, '')) && DATA_WORD_RE.test(m[1])) writes.push({ line: i + 1, text: text.trim(), kind: 'storeToRefs' })
          }
        })
        if (writes.length) {
          const w = writes[0]
          addFinding(report, {
            id: 'server-data-copied-to-store', level: 'heuristic', severity: 'medium', file: rel, line: w.line + offset,
            message: `fetches or queries (line ${fetchLines[0] + offset}) and writes the result into a store (${writes.length} write${writes.length > 1 ? 's' : ''}): the query cache already owns that data`,
            evidence: `fetch at line ${fetchLines[0] + offset}; write at line ${w.line + offset}: ${w.text.slice(0, 120)}`,
            fix: 'read the data from the query (state.data / useQuery) where it is needed; keep the store for client-owned state only; if several components need it, share the query composable, not a copy',
          })
        }
      }
    }

    // ---- browser APIs and non-deterministic values evaluated during server rendering (1.4, AST context)
    if (info.semantic?.browserApiUses?.length) {
      // only Nuxt's .client suffix skips server rendering; a React 'use client' component still renders on the server
      const clientOnly = /\.client\.[cm]?[jt]sx?$|\.client\.vue$/.test(rel)
      const isReactFile = /\.[jt]sx$/.test(rel)
      const clientLifecycle = new Set(['onMounted', 'onBeforeUnmount', 'onUnmounted', 'onActivated', 'onDeactivated', 'onUpdated', 'useEffect', 'useLayoutEffect', 'onNuxtReady', 'nextTick', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'addEventListener', 'watch', 'watchEffect', 'useEventListener', 'callOnce'])
      const reported = new Set()
      for (const u of info.semantic.browserApiUses) {
        if (clientOnly || u.guarded) continue
        const inLifecycle = u.calls.some((c) => clientLifecycle.has(c))
        if (inLifecycle) continue
        const key = `${u.name}@${u.line}`
        if (reported.has(key)) continue
        reported.add(key)
        if (u.nondeterministic) {
          if (u.inFunction && !info.isVue && !isReactFile) continue
          if (u.inFunction && info.isVue && info.setup) continue // a helper called later, not setup itself
          if (u.inFunction && isReactFile && !/^[A-Z]/.test(u.enclosingFunction ?? '')) continue
          addFinding(report, { id: 'nondeterministic-render', level: 'heuristic', severity: ssrOff ? 'low' : 'medium', file: rel, line: u.line, message: `${u.name} evaluated during render${ssrOff ? ' (no SSR today: becomes a hydration mismatch the day SSR is enabled)' : ': the server and the client produce different markup (hydration mismatch)'}`, fix: 'compute random ids and timestamps on the client (onMounted / useEffect) or generate them once on the server and pass them down (useId for ids)' })
          continue
        }
        // Vue script setup top level and module scope run on the server; in React the render body does too
        const setupLevel = info.isVue ? !u.inFunction : !u.inFunction
        const renderBody = isReactFile && u.inFunction && /^[A-Z]/.test(u.enclosingFunction ?? '') && !u.calls.length
        if (!setupLevel && !renderBody) continue
        const sureServer = project.framework === 'nuxt' && !ssrOff && setupLevel
        addFinding(report, {
          id: 'browser-api-in-setup', level: sureServer ? 'confirmed' : 'heuristic', severity: ssrOff ? 'low' : sureServer ? 'high' : 'medium', file: rel, line: u.line,
          message: `${u.name} used ${renderBody ? 'in the render body of ' + u.enclosingFunction : setupLevel && info.isVue && info.setup ? 'at the top level of <script setup>' : 'at module scope'}${ssrOff ? ' (ssr: false today: breaks the day SSR is enabled)' : ': it runs on the server, where it does not exist'}`,
          fix: 'move the access into onMounted / useEffect, guard it with import.meta.client or typeof window, or make the component client-only (.client.vue, <ClientOnly>, dynamic import without SSR)',
        })
      }
    }

    // ---- logout without cache clear
    const definesLogout = /function\s+(?:logout|signOut|logOut|cerrarSesion)\s*\(|(?:const|let)\s+(?:logout|signOut|logOut|cerrarSesion)\s*=|(?:^|[\s,{])(?:async\s+)?(?:logout|signOut|logOut|cerrarSesion)\s*\([^)]*\)\s*(?::\s*[^{=]+)?\{/m.test(stripped)
    if (definesLogout) {
      const clears = /\b(?:clearNuxtState|clearNuxtData|invalidateQueries|removeQueries|queryCache\.clear|queryClient\.clear|\$reset|resetAllStores|clearLocal|clearAll|localStorage\.clear|sessionStorage\.clear|broadcast|BroadcastChannel)\b/.test(stripped)
      if (!clears) {
        addFinding(report, { id: 'logout-without-cache-clear', level: 'heuristic', severity: hasQueryCache ? 'medium' : 'low', file: rel, message: `logout here does not visibly clear ${hasQueryCache ? 'the query cache, ' : ''}stores or persisted state`, fix: 'on logout: clear query caches, reset stores, remove persisted user-scoped keys, broadcast to other tabs' })
      }
    }
  }

  // useState key findings
  for (const entry of stateKeys.values()) {
    const filesArr = [...entry.files]
    if (filesArr.length >= 2) {
      const multiDomain = entry.domains.size >= 2
      addFinding(report, { id: 'raw-state-key-shared', level: 'heuristic', severity: multiDomain ? 'medium' : 'low', file: [...entry.owners][0] ?? filesArr[0], message: `useState('${entry.key}') literal appears in ${filesArr.length} files${multiDomain ? ` across domains ${[...entry.domains].join(', ')}` : ''}`, evidence: filesArr.join(', '), fix: 'wrap the key in one typed composable owned by one module; other code calls the composable, never the raw key' })
    }
  }

  report.summary = {
    files: files.size,
    piniaStores: stores.length,
    nuxtStateKeys: stateKeys.size,
    webStorageWrites: storageKeys.length,
    moduleLevelState: moduleState.length,
    ssr: project.nuxt ? project.nuxt.ssr : 'n/a',
    queryCache: hasQueryCache ? Object.keys(project.deps).filter((d) => /colada|react-query|vue-query/.test(d)).join(', ') : 'none detected',
  }
  report.data = { stores, stateKeys: [...stateKeys.values()].map((e) => ({ key: e.key, files: [...e.files], owners: [...e.owners], domains: [...e.domains] })), storageKeys, moduleState }
  const sections = []
  if (stores.length) sections.push({ title: 'Stores', table: { headers: ['store', 'file', 'lines', 'members', 'consumers', 'domains', 'http', 'persist'], rows: stores.map((s) => [s.id, s.file, s.lines, s.members, s.consumers, s.domains.join(','), s.http, s.persist ?? '-']) } })
  if (stateKeys.size) sections.push({ title: 'Nuxt useState keys', table: { headers: ['key', 'files', 'owners', 'domains'], rows: [...stateKeys.values()].map((e) => [e.key, e.files.size, [...e.owners].join(', ') || '-', [...e.domains].join(',')]) } })
  if (storageKeys.length) sections.push({ title: 'Web storage writes', table: { headers: ['storage', 'key', 'file', 'sensitive'], rows: storageKeys.map((k) => [k.storage, k.key, k.file, k.sensitive ? 'YES' : '']) } })
  return finish(report, args, { sections })
}

function lineAt(code, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (code[i] === '\n') line++
  return line
}

// Set the exit code instead of calling process.exit: large --json outputs piped to another process
// would otherwise be truncated at 64 KiB when the process exits before stdout drains.
if (isMainModule(import.meta.url)) process.exitCode = run(process.argv.slice(2))
