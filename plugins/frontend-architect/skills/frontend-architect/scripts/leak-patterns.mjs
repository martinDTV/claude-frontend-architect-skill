#!/usr/bin/env node
// Finds resources created in components, composables and hooks without a visible cleanup:
// listeners, intervals, observers, animation frames, EventSource/WebSocket, GSAP tweens and
// ScrollTriggers, Lenis, Three.js objects, store subscriptions. Lexical: a cleanup in another
// file or a helper the tool does not know will show up as a false positive. Read-only.
//
// Usage: leak-patterns.mjs <project-root> [--json|--md] [--fail-on confirmed|any|none]
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildGraph } from './lib/graph.mjs'
import { detectProject, excludeArg, loadConfig } from './lib/project.mjs'
import { ENGINE_HELP, addFinding, createReport, engineOptionsFrom, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'
import { countMatches, lineOf } from './lib/source.mjs'

const HELP = `
leak-patterns — resources created without a visible cleanup.

usage: node leak-patterns.mjs <project-root> [options]
  --exclude <globs>   comma-separated project-relative globs to leave out (also "exclude" in .frontend-audit.json)
  --json | --md       output format
  --fail-on <level>   exit 1 on: confirmed | any | none (default confirmed; this tool emits heuristics only)${ENGINE_HELP}

Each finding names the resource, the first line that creates it and what cleanup was expected.
Verify by reading the file: cleanup may live in a helper, a VueUse composable or a parent.

Motion rules (1.5, semantic engine only; the lexical engine keeps the leak-gsap pair count):
  gsap-module-scope-animation   gsap.to/from/fromTo/set/timeline or ScrollTrigger.create at module scope (confirmed)
  gsap-outside-client-lifecycle the same at the top level of <script setup> (confirmed with SSR) or in a React render body (heuristic)
  gsap-effect-without-cleanup   created inside useEffect/useLayoutEffect whose callback returns no cleanup (confirmed)
  scrolltrigger-without-cleanup ScrollTriggers in a file with no revert/kill/useGSAP (confirmed), or inside a context that is never reverted (heuristic)
  motion-without-reduced-motion scroll-driven, pinned or infinite motion with no prefers-reduced-motion branch in the file (heuristic)
Recognised cleanup: useGSAP, ctx.revert()/mm.revert(), tween.kill()/trigger.kill(), ScrollTrigger.killAll, getAll()+kill. A tween in an
event handler or a factory function is not reported. .client.vue files and import.meta.client guards are exempt from the SSR rule.
`

export const RESOURCES = [
  { id: 'event-listener', label: 'addEventListener', create: /\.addEventListener\s*\(/g, cleanup: /\.removeEventListener\s*\(|\buseEventListener\s*\(|\bsignal\s*:|\{\s*once\s*:\s*true/g, expected: 'removeEventListener in onBeforeUnmount/onScopeDispose/effect cleanup, or VueUse useEventListener, or { signal }', severity: 'medium' },
  { id: 'interval', label: 'setInterval', create: /\bsetInterval\s*\(/g, cleanup: /\bclearInterval\s*\(|\buseIntervalFn\b|\buseInterval\b/g, expected: 'clearInterval on unmount (or VueUse useIntervalFn)', severity: 'medium' },
  { id: 'timeout', label: 'setTimeout', create: /\bsetTimeout\s*\(/g, cleanup: /\bclearTimeout\s*\(|\buseTimeoutFn\b|\buseTimeout\b/g, expected: 'clearTimeout on unmount when the callback touches component state', severity: 'low', minCreates: 2 },
  { id: 'observer', label: 'Resize/Intersection/Mutation/PerformanceObserver', create: /\bnew\s+(?:ResizeObserver|IntersectionObserver|MutationObserver|PerformanceObserver)\s*\(/g, cleanup: /\.disconnect\s*\(|\.unobserve\s*\(|\buse(?:ResizeObserver|IntersectionObserver|MutationObserver|ElementSize|ElementVisibility)\b/g, expected: 'observer.disconnect() on unmount (or the VueUse composable)', severity: 'medium' },
  { id: 'raf', label: 'requestAnimationFrame', create: /\brequestAnimationFrame\s*\(/g, cleanup: /\bcancelAnimationFrame\s*\(|\buseRafFn\b|\bsetAnimationLoop\s*\(\s*null/g, expected: 'cancelAnimationFrame of the last frame id on unmount', severity: 'medium' },
  { id: 'stream', label: 'EventSource/WebSocket', create: /\bnew\s+(?:EventSource|WebSocket)\s*\(/g, cleanup: /\.close\s*\(|\buse(?:EventSource|WebSocket)\b/g, expected: '.close() on unmount, logout and tenant switch', severity: 'high' },
  { id: 'gsap', label: 'GSAP tween/timeline/ScrollTrigger', create: /\bgsap\.(?:to|from|fromTo|timeline|set|quickTo)\s*\(|\bScrollTrigger\.(?:create|batch)\s*\(/g, cleanup: /\bgsap\.context\s*\(|\buseGSAP\s*\(|\.revert\s*\(|\.kill\s*\(|\bgsap\.matchMedia\s*\(|\bScrollTrigger\.killAll\b/g, expected: 'gsap.context() reverted on unmount (useGSAP in React), or tl.kill()/ScrollTrigger kill', severity: 'medium' },
  { id: 'lenis', label: 'Lenis', create: /\bnew\s+Lenis\s*\(/g, cleanup: /\.destroy\s*\(/g, expected: 'lenis.destroy() and ticker removal on unmount', severity: 'medium' },
  { id: 'three', label: 'Three.js renderer/geometry/material/texture', create: /\bnew\s+(?:THREE\.)?(?:WebGLRenderer|WebGPURenderer|[A-Z]\w*Geometry|[A-Z]\w*Material|(?:Canvas|Video|Data|Compressed)?Texture|WebGLRenderTarget|TextureLoader|GLTFLoader)\s*\(/g, cleanup: /\.dispose\s*\(|\bdisposeObject\b|\buseDispose\b|\bdispose\s*\(/g, expected: 'dispose geometries, materials, textures, render targets and the renderer on unmount (TresJS/R3F dispose what they create; imperative objects are yours)', severity: 'high' },
  { id: 'subscription', label: 'subscribe/$subscribe/$onAction/onSnapshot', create: /\.subscribe\s*\(|\$subscribe\s*\(|\$onAction\s*\(|\bonSnapshot\s*\(|\.on\s*\(\s*['"]/g, cleanup: /\.unsubscribe\s*\(|\bunsub\w*\s*\(|\.off\s*\(|\bonScopeDispose\b|\bonBeforeUnmount\b|\bonUnmounted\b|\breturn\s*\(\)\s*=>/g, expected: 'call the returned unsubscribe function on unmount', severity: 'medium' },
  { id: 'media-query', label: 'matchMedia listener', create: /matchMedia\s*\([^)]*\)\s*\.\s*add(?:EventListener|Listener)\s*\(/g, cleanup: /\.remove(?:EventListener|Listener)\s*\(|\buseMediaQuery\b|\busePreferredReducedMotion\b|\busePreferredDark\b/g, expected: 'remove the listener on unmount (or VueUse useMediaQuery)', severity: 'low' },
  { id: 'object-url', label: 'URL.createObjectURL', create: /URL\.createObjectURL\s*\(/g, cleanup: /URL\.revokeObjectURL\s*\(/g, expected: 'URL.revokeObjectURL when the blob is no longer displayed', severity: 'low' },
  // 1.3: channels, workers, idle callbacks and media streams hold handles or threads until closed
  { id: 'channel', label: 'BroadcastChannel/MessageChannel', create: /\bnew\s+(?:BroadcastChannel|MessageChannel)\s*\(/g, cleanup: /\.close\s*\(|\buseBroadcastChannel\b/g, expected: 'channel.close() (and port.close()) on unmount, logout and tenant switch', severity: 'medium' },
  { id: 'worker', label: 'Worker/SharedWorker', create: /\bnew\s+(?:Shared)?Worker\s*\(/g, cleanup: /\.terminate\s*\(|\.port\.close\s*\(|\buseWebWorker(?:Fn)?\b/g, expected: 'worker.terminate() on unmount (VueUse useWebWorker terminates for you)', severity: 'high' },
  { id: 'idle-callback', label: 'requestIdleCallback', create: /\brequestIdleCallback\s*\(/g, cleanup: /\bcancelIdleCallback\s*\(/g, expected: 'cancelIdleCallback of the pending id on unmount', severity: 'low' },
  { id: 'media-stream', label: 'getUserMedia/getDisplayMedia', create: /\bget(?:User|Display)Media\s*\(/g, cleanup: /\.getTracks\s*\(\)\s*\.forEach|\.stop\s*\(|\buseUserMedia\b|\buseDisplayMedia\b/g, expected: 'stop every track of the stream on unmount (track.stop())', severity: 'high' },
]

const CLEANUP_HOOK_RE = /\b(?:onBeforeUnmount|onUnmounted|onScopeDispose|onDeactivated|tryOnScopeDispose|tryOnUnmounted|effectScope|useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?return\s*\(\)\s*=>|return\s*\(\)\s*=>\s*\{|componentWillUnmount|\bdispose\b)/

function isCandidate(info) {
  if (info.isVue) return true
  return /(^|\/)(?:composables|hooks|plugins|components|features|modules|modulos|app|pages|src)\//.test(info.rel) && /\.[cm]?[jt]sx?$/.test(info.rel)
}

const CLEANUP_CALLS = new Set(['onBeforeUnmount', 'onUnmounted', 'onScopeDispose', 'onDeactivated', 'tryOnScopeDispose', 'tryOnUnmounted', 'effectScope'])

export function scanFile(info) {
  const code = info.stripped
  const out = []
  for (const r of RESOURCES) {
    const creates = [...code.matchAll(r.create)]
    if (!creates.length || creates.length < (r.minCreates ?? 1)) continue
    const cleanups = countMatches(code, r.cleanup)
    const offset = info.isVue ? info.scriptLine : 0
    out.push({ id: r.id, label: r.label, creates: creates.length, cleanups, firstLine: lineOf(code, creates[0].index) + offset, expected: r.expected, severity: r.severity })
  }
  // With the AST available, a cleanup hook is a real call (not a word in a comment or a string);
  // React effects count when a `return () =>` exists inside a useEffect body (lexical check kept).
  const astHook = info.semantic ? [...info.semantic.calls.keys()].some((name) => CLEANUP_CALLS.has(name)) || (info.semantic.calls.has('useEffect') && /return\s*\(\)\s*=>/.test(code)) || info.semantic.memberCalls.some((m) => m.name === 'dispose') : null
  return { resources: out, hasCleanupHook: astHook ?? CLEANUP_HOOK_RE.test(code), cleanupSource: astHook === null ? 'lexical' : 'ast' }
}

// ---------------------------------------------------------------- motion rules (1.5): GSAP calls with their AST context
const CLIENT_LIFECYCLE = new Set(['onMounted', 'onBeforeMount', 'onUnmounted', 'onBeforeUnmount', 'onActivated', 'onDeactivated', 'onUpdated', 'useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useGSAP', 'onNuxtReady', 'nextTick', 'watch', 'watchEffect', 'watchPostEffect', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'addEventListener', 'useEventListener', 'callOnce', 'then'])
const CREATES = new Set(['tween', 'timeline', 'scrolltrigger'])
const REDUCED_MOTION_RE = /prefers-reduced-motion|usePreferredReducedMotion|useReducedMotion|reducedMotion|reduceMotion|matchMediaRefresh/

/** Findings of the motion rules for one file; empty without the semantic engine or without GSAP creation calls. */
export function scanMotion(info, project) {
  const uses = info.semantic?.motionUses ?? []
  const creates = uses.filter((u) => CREATES.has(u.kind))
  if (!creates.length) return []
  const clientOnly = /\.client\.[cm]?[jt]sx?$|\.client\.vue$/.test(info.rel)
  const isReact = /\.[jt]sx$/.test(info.rel)
  const ssrOff = project.nuxt ? project.nuxt.ssr === false : false
  const has = (kind) => uses.some((u) => u.kind === kind)
  const cleanupEvidence = has('usegsap') || has('revert') || has('kill') || has('killall')
  const trackerOnly = !cleanupEvidence && (has('context') || has('matchmedia'))
  const scrollCreates = creates.filter((u) => u.kind === 'scrolltrigger' || u.flags?.scrollTrigger)
  const out = []
  const seen = new Set()
  const push = (f) => {
    const key = `${f.id}|${f.line}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(f)
    }
  }
  for (const u of creates) {
    if (clientOnly || u.guarded) continue
    if (u.calls.some((c) => CLIENT_LIFECYCLE.has(c))) continue
    const setupLevel = u.topLevel && info.isVue && info.setup
    const moduleScope = u.topLevel && !setupLevel
    const renderBody = isReact && u.inFunction && /^[A-Z]/.test(u.enclosingFunction ?? '') && !u.calls.length
    if (moduleScope) push({ id: 'gsap-module-scope-animation', level: 'confirmed', severity: ssrOff ? 'medium' : 'high', line: u.line, message: `${u.name}() at module scope: one shared animation for every component instance, created when the module is imported${ssrOff ? '' : ', on the server too during SSR'}`, fix: 'create tweens and timelines inside the component lifecycle (onMounted with gsap.context, useGSAP, useEffect with a reverting cleanup) or in a factory called from it; keep module scope for configuration' })
    else if (setupLevel) push({ id: 'gsap-outside-client-lifecycle', level: project.framework === 'nuxt' && !ssrOff ? 'confirmed' : 'heuristic', severity: ssrOff ? 'low' : 'high', line: u.line, message: `${u.name}() at the top level of <script setup>: it runs during server rendering, where there is no DOM${ssrOff ? ' (ssr: false today; breaks the day SSR is enabled)' : ''}`, fix: 'move it into onMounted (inside gsap.context, reverted in onUnmounted) or guard it with import.meta.client; .client.vue components are exempt' })
    else if (renderBody) push({ id: 'gsap-outside-client-lifecycle', level: 'heuristic', severity: 'medium', line: u.line, message: `${u.name}() in the render body of ${u.enclosingFunction}: it runs on every render and, with server rendering, on the server`, fix: 'move it into useGSAP(() => {...}, { scope }) or into useEffect with a cleanup that reverts the context' })
  }
  if (isReact) {
    for (const u of creates) {
      const e = u.effect
      if (!e || !/^use(?:Layout|Insertion)?Effect$/.test(e.hook) || e.hasCleanupReturn || u.calls.includes('useGSAP')) continue
      push({ id: 'gsap-effect-without-cleanup', level: 'confirmed', severity: 'medium', line: u.line, message: `${u.name}() inside ${e.hook} whose callback returns no cleanup: the animation survives unmount${e.deps === 'none' ? ' and a new one is created on every render' : ''}; React Strict Mode runs the effect twice and creates it twice`, fix: 'useGSAP(() => {...}, { scope }) from @gsap/react, or create a gsap.context() in the effect and return () => ctx.revert()' })
    }
  }
  if (scrollCreates.length && !cleanupEvidence) {
    const first = scrollCreates[0]
    push({ id: 'scrolltrigger-without-cleanup', level: trackerOnly ? 'heuristic' : 'confirmed', severity: 'high', line: first.line, message: trackerOnly ? `${scrollCreates.length} ScrollTrigger(s) created inside gsap.context()/gsap.matchMedia() but nothing in this file reverts or kills them: the context is never reverted on unmount` : `${scrollCreates.length} ScrollTrigger(s) created with no revert(), kill() or useGSAP in this file: pins, listeners and scroll positions survive navigation away from the component`, fix: 'revert the context in onUnmounted or in the effect cleanup (ctx.revert() / mm.revert()), use useGSAP in React, or kill the trigger explicitly' })
  }
  const needsReduced = scrollCreates.length > 0 || creates.some((u) => u.flags && (u.flags.scrub || u.flags.pin || u.flags.infinite))
  if (needsReduced && !has('matchmedia') && !has('matchmediarefresh') && !REDUCED_MOTION_RE.test(info.stripped)) {
    const u = scrollCreates[0] ?? creates.find((c) => c.flags && (c.flags.scrub || c.flags.pin || c.flags.infinite))
    push({ id: 'motion-without-reduced-motion', level: 'heuristic', severity: 'medium', line: u.line, message: 'scroll-driven, pinned or infinite motion in this file with no prefers-reduced-motion branch (no gsap.matchMedia, media query or reduced-motion composable)', fix: 'gsap.matchMedia().add({ reduce: "(prefers-reduced-motion: reduce)", motion: "(prefers-reduced-motion: no-preference)" }, ctx => ...) with an instant or minimal variant for reduce' })
  }
  return out
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
  const report = createReport('leak-patterns', project)
  const rows = []
  let scanned = 0
  let motionFindings = 0
  const byResource = {}
  let graph
  try {
    graph = buildGraph(project, { autoImports: false, ...engineOptionsFrom(args) })
  } catch (error) {
    return fail(error.message)
  }
  report.analysis = graph.analysis
  for (const info of graph.files.values()) {
    if (!isCandidate(info)) continue
    scanned++
    const { resources, hasCleanupHook, cleanupSource } = scanFile(info)
    for (const f of scanMotion(info, project)) {
      motionFindings++
      addFinding(report, { ...f, file: info.rel })
    }
    for (const r of resources) {
      byResource[r.id] = (byResource[r.id] ?? 0) + r.creates
      rows.push({ file: info.rel, ...r, hasCleanupHook, cleanupSource })
      if (r.cleanups === 0) {
        addFinding(report, { id: `leak-${r.id}`, level: 'heuristic', severity: r.severity, file: info.rel, line: r.firstLine, message: `${r.label} created ${r.creates}x with no visible cleanup${hasCleanupHook ? '' : ' (file has no unmount/dispose hook at all)'}`, fix: r.expected })
      } else if (r.id === 'event-listener' && r.creates - r.cleanups >= 2) {
        addFinding(report, { id: 'leak-event-listener', level: 'heuristic', severity: 'low', file: info.rel, line: r.firstLine, message: `${r.creates} addEventListener vs ${r.cleanups} removeEventListener: check that every listener is removed`, fix: 'remove each listener with the same handler reference, or use one AbortController signal for all of them' })
      }
    }
  }
  report.summary = { filesScanned: scanned, filesWithResources: new Set(rows.map((r) => r.file)).size, resourcesByType: byResource, potentialLeaks: report.findings.length, motionFindings, motionRules: graph.analysis?.engine === 'semantic' ? 'active' : 'inactive (lexical engine)' }
  report.data = { rows }
  const sections = rows.length ? [{ title: 'Resources per file', table: { headers: ['file', 'resource', 'creates', 'cleanups', 'first line', 'unmount hook'], rows: rows.map((r) => [r.file, r.id, r.creates, r.cleanups, r.firstLine, r.hasCleanupHook ? 'yes' : 'no']) } }] : []
  return finish(report, args, { sections })
}

// Set the exit code instead of calling process.exit: large --json outputs piped to another process
// would otherwise be truncated at 64 KiB when the process exits before stdout drains.
if (isMainModule(import.meta.url)) process.exitCode = run(process.argv.slice(2))
