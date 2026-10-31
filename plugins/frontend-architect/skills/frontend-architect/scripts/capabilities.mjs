#!/usr/bin/env node
// Capability coordination (1.5, increment 1): which capabilities a frontend task needs, which internal skill or
// agent owns each one, and which optional external skills, if any, are really available in this environment to
// collaborate. Read-only: it reads the registry (assets/capabilities.json), the Claude Code plugin records and
// settings files it is pointed at, and SKILL.md frontmatter; it never runs a skill, never spawns a process, never
// touches the network. Its output is a recommendation with evidence rules, not an execution.
//
// Usage: capabilities.mjs [project-root] --task "<text>" | --needs <cap,cap> [--config-dir ~/.claude]
//        [--max-external 1] [--no-detect] [--json|--md] [--fail-on confirmed|any|none]
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addFinding, createReport, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'

const HELP = `
capabilities — capabilities a task needs, their internal owners, and the external skills available to collaborate.

usage: node capabilities.mjs [project-root] (--task "<text>" | --needs <list>) [options]
  --task <text>         the task in the user's words (English or Spanish); capabilities are inferred from it
  --needs <list>        explicit capabilities, comma-separated (visual-direction, design-system, ui-implementation,
                        visual-critique, ui-polish, responsive-design, accessibility-review, motion-design,
                        3d-experience, frontend-architecture, browser-verification); overrides inference
  --config-dir <dir>    Claude Code configuration directory to read (default: ~/.claude; pass the value of
                        CLAUDE_CONFIG_DIR when you use another profile; the tool never reads environment variables)
  --project <dir>       project whose .claude/settings*.json and .claude/skills apply (default: the first
                        positional argument, else the working directory)
  --max-external <n>    distinct external integrations a plan may select (default 1: proportional, never "all")
  --no-detect           skip the environment scan: plan with internal owners only
  --json | --md         output format
  --fail-on <level>     exit 1 on: confirmed (default; this tool emits none) | any | none

What the output means: every needed capability has an internal owner that always applies. A collaborator listed as
"selected" is available (installed, enabled for this project, known to the registry, not obsolete) and recommended;
it has NOT been run. Execution exists only when the session shows a Skill tool invocation of that skill and its
result. Managed settings and --plugin-dir plugins are not read: a collaborator can still be blocked or shadowed.
`

const here = dirname(fileURLToPath(import.meta.url))
const REGISTRY_FILE = join(here, '..', 'assets', 'capabilities.json')
const MODEL_HIDDEN_OVERRIDES = new Set(['name-only', 'user-invocable-only'])

export function loadRegistry(file = REGISTRY_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

// ---------------------------------------------------------------- capability inference (deterministic)
// Words are matched on word boundaries over the lower-cased task, accents kept. A UI noun is required for
// ui-implementation (verbs alone such as "implement" never trigger it); technical phrasing without design words
// keeps the plan technical; an explicit "without visual changes" removes every visual capability.
const UI_NOUNS = ['dashboard', 'admin', 'back office', 'back-office', 'panel', 'page', 'pages', 'screen', 'screens', 'form', 'forms', 'table', 'tables', 'component', 'components', 'interface', 'ui', 'landing', 'landing page', 'portfolio', 'website', 'site', 'app shell', 'modal', 'wizard', 'onboarding', 'pantalla', 'pantallas', 'formulario', 'formularios', 'tabla', 'tablas', 'componente', 'componentes', 'interfaz', 'página', 'páginas', 'sitio', 'tablero']
const BUILD_VERBS = ['build', 'building', 'create', 'creating', 'implement', 'implementing', 'develop', 'make', 'add', 'new', 'design', 'designing', 'ship', 'scaffold', 'crear', 'construir', 'implementar', 'desarrollar', 'nuevo', 'nueva', 'añadir', 'agregar', 'diseñar', 'maquetar']
const KEYWORDS = {
  'visual-direction': ['landing', 'landing page', 'premium', 'brand', 'branding', 'art direction', 'visual direction', 'hero', 'look and feel', 'marketing site', 'portfolio', 'aesthetic', 'aesthetics', 'editorial', 'award', 'dirección visual', 'estética', 'marca', 'página de aterrizaje', 'portada', 'identidad visual'],
  'design-system': ['design system', 'design tokens', 'tokens', 'theme', 'theming', 'component library', 'dashboard', 'admin', 'back office', 'back-office', 'saas', 'density', 'sistema de diseño', 'tema', 'paleta', 'palette', 'typography scale', 'escala tipográfica', 'densidad'],
  'visual-critique': ['critique', 'design review', 'review the design', 'review the ui', 'feedback on the', 'improve the look', 'improve the interface', 'improve an existing', 'improve the existing', 'mejorar la interfaz', 'mejorar una interfaz', 'mejorar el diseño', 'revisar el diseño', 'crítica visual', 'redesign', 'rediseñ'],
  'ui-polish': ['polish', 'refine', 'refinement', 'micro-interaction', 'micro-interactions', 'microinteraction', 'microinteractions', 'finishing touches', 'pulir', 'afinar', 'detalles finales', 'without a full redesign', 'without redesigning', 'sin rediseñar', 'sin rediseñarla'],
  'responsive-design': ['responsive', 'mobile', 'tablet', 'breakpoint', 'breakpoints', 'viewport', 'viewports', 'small screens', 'móvil', 'adaptable', 'pantallas pequeñas'],
  'accessibility-review': ['accessibility', 'accessible', 'a11y', 'wcag', 'screen reader', 'contrast', 'keyboard', 'focus', 'accesibilidad', 'accesible', 'lector de pantalla', 'contraste', 'teclado', 'foco'],
  'creative-direction': ['creative brief', 'brief', 'storyboard', 'art direction', 'creative direction', 'concept', 'moodboard', 'mood board', 'references', 'cinematic', 'immersive experience', 'dirección creativa', 'dirección de arte', 'guion gráfico', 'experiencia inmersiva', 'cinematográfica', 'cinematográfico'],
  'motion-design': ['animation', 'animations', 'animate', 'animated', 'gsap', 'scrolltrigger', 'scroll-triggered', 'scroll animation', 'motion', 'transition', 'transitions', 'parallax', 'lenis', 'smooth scroll', 'animación', 'animaciones', 'animar', 'transición', 'transiciones'],
  '3d-experience': ['three.js', 'threejs', 'three js', '3d', 'webgl', 'webgpu', 'shader', 'shaders', 'glsl', 'tresjs', 'react three fiber', 'r3f', 'experiencia 3d', 'escena 3d'],
  'frontend-architecture': ['architecture', 'architectural', 'refactor', 'refactoring', 'state management', 'store', 'stores', 'api layer', 'data layer', 'contract', 'contracts', 'props', 'module boundaries', 'boundaries', 'monorepo', 'microfrontend', 'microfrontends', 'ssr', 'hydration', 'typescript', 'arquitectura', 'refactorizar', 'refactorización', 'contratos', 'capa de datos', 'estado global', 'módulos'],
  'browser-verification': ['audit', 'auditing', 'verify in the browser', 'in the browser', 'regression', 'regressions', 'axe', 'playwright', 'screenshot', 'screenshots', 'visual regression', 'auditar', 'auditoría', 'regresión', 'regresiones', 'verificar en el navegador'],
}
const TECHNICAL_ONLY = ['fix', 'fixing', 'bug', 'bugs', 'defect', 'defects', 'regression', 'broken', 'crash', 'error', 'refactor', 'refactoring', 'migrate', 'migration', 'typecheck', 'type error', 'corregir', 'arreglar', 'defecto', 'defectos', 'fallo', 'falla', 'refactorizar', 'migrar', 'error técnico']
const NO_VISUAL_CHANGE = ['without changing the design', 'without visual changes', 'no visual change', 'no visual changes', 'without modifying the design', 'keep the design', 'sin modificar el diseño', 'sin cambiar el diseño', 'sin cambios visuales', 'sin tocar el diseño']
const VISUAL = new Set(['visual-direction', 'design-system', 'ui-implementation', 'visual-critique', 'ui-polish'])
const IMPLIES = {
  'ui-implementation': ['responsive-design', 'accessibility-review'],
  'visual-direction': ['responsive-design', 'accessibility-review'],
  'visual-critique': ['accessibility-review'],
  'ui-polish': ['accessibility-review'],
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasWord = (text, phrase) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(phrase)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(text)

/** Capabilities inferred from a task text; deterministic, order = registry order. Returns { needed, matched, notes }. */
export function capabilitiesFor(task, registry = loadRegistry()) {
  const text = String(task ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const order = registry.capabilities.map((c) => c.id)
  const matched = {}
  for (const [cap, words] of Object.entries(KEYWORDS)) {
    const hits = words.filter((w) => hasWord(text, w))
    if (hits.length) matched[cap] = hits
  }
  const uiNoun = UI_NOUNS.filter((w) => hasWord(text, w))
  const buildVerb = BUILD_VERBS.filter((w) => hasWord(text, w))
  const improving = Boolean(matched['visual-critique'] || matched['ui-polish'])
  // a UI noun alone does not mean building it: "improve the interface" is critique and polish, not implementation
  if (uiNoun.length && (buildVerb.length || !improving)) matched['ui-implementation'] = [...uiNoun, ...buildVerb]
  const notes = []
  const technical = TECHNICAL_ONLY.filter((w) => hasWord(text, w))
  const noVisual = NO_VISUAL_CHANGE.filter((w) => hasWord(text, w))
  const designWords = ['visual-direction', 'design-system', 'visual-critique', 'ui-polish'].some((c) => matched[c])
  if (technical.length && !designWords) {
    // a fix, a refactor or a migration named without any design word stays technical even when it names a component
    for (const cap of VISUAL) delete matched[cap]
    matched['frontend-architecture'] = [...new Set([...(matched['frontend-architecture'] ?? []), ...technical])]
    if (technical.some((w) => /fix|bug|defect|regression|broken|crash|error|corregir|arreglar|defecto|fallo|falla/.test(w))) matched['browser-verification'] = [...new Set([...(matched['browser-verification'] ?? []), 'fix → verify'])]
    notes.push(`technical phrasing (${technical.join(', ')}) without design words: visual capabilities not inferred`)
  }
  if (noVisual.length) {
    for (const cap of VISUAL) delete matched[cap]
    notes.push(`"${noVisual[0]}": visual capabilities removed`)
  }
  const needed = new Set(Object.keys(matched))
  for (const cap of [...needed]) for (const implied of IMPLIES[cap] ?? []) if (!needed.has(implied)) { needed.add(implied); matched[implied] = [`implied by ${cap}`] }
  return { needed: order.filter((c) => needed.has(c)), matched, notes }
}

// ---------------------------------------------------------------- environment detection (read-only)
function readJsonSafe(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
function realOrSelf(p) {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}
const samePath = (a, b) => Boolean(a && b) && realOrSelf(resolve(a)) === realOrSelf(resolve(b))

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return {}
  const out = {}
  let section = null
  for (const line of m[1].split('\n')) {
    const top = /^([\w-]+):\s*(.*)$/.exec(line)
    if (top) {
      section = top[2] === '' ? top[1] : null
      out[top[1]] = top[2].replace(/^["']|["']$/g, '')
      continue
    }
    const nested = /^\s+([\w-]+):\s*(.*)$/.exec(line)
    if (nested && section) out[`${section}.${nested[1]}`] = nested[2].replace(/^["']|["']$/g, '')
  }
  return out
}

function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

function settingsChain(configDir, projectDir) {
  return [
    { scope: 'user', file: join(configDir, 'settings.json') },
    { scope: 'project', file: join(projectDir, '.claude', 'settings.json') },
    { scope: 'local', file: join(projectDir, '.claude', 'settings.local.json') },
  ].map((s) => ({ ...s, data: existsSync(s.file) ? readJsonSafe(s.file) : null }))
}

/** Highest-precedence explicit value: local > project > user (managed and --settings are not read). */
function resolveSetting(chain, key, id) {
  let value
  let source = null
  for (const s of chain) {
    const v = s.data?.[key]?.[id]
    if (v !== undefined) {
      value = v
      source = s.scope
    }
  }
  return { value, source }
}

function listSkills(dir, source) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    let isDir = entry.isDirectory()
    if (!isDir && entry.isSymbolicLink()) {
      try {
        isDir = statSync(join(dir, entry.name)).isDirectory()
      } catch {
        isDir = false
      }
    }
    if (!isDir) continue
    const skillFile = join(dir, entry.name, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const fm = frontmatter(readFileSync(skillFile, 'utf8'))
    out.push({ dir: join(dir, entry.name), source, dirName: entry.name, name: (fm.name || entry.name).trim(), version: fm.version ?? fm['metadata.version'] ?? null, isPluginDir: existsSync(join(dir, entry.name, '.claude-plugin', 'plugin.json')), description: fm.description ?? '' })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function marketplaceListing(configDir, pluginId) {
  const [name, marketplace] = pluginId.split('@')
  const dir = join(configDir, 'plugins', 'marketplaces', marketplace)
  const catalog = readJsonSafe(join(dir, '.claude-plugin', 'marketplace.json'))
  const listed = Array.isArray(catalog?.plugins) && catalog.plugins.some((p) => p?.name === name)
  return listed ? marketplace : null
}

/** State of every registry integration in this environment, plus unknown and lookalike skills. */
export function detectIntegrations(registry, { configDir, projectDir }) {
  const chain = settingsChain(configDir, projectDir)
  const installed = readJsonSafe(join(configDir, 'plugins', 'installed_plugins.json'))
  const records = Object.entries(installed?.plugins ?? {}).flatMap(([id, list]) => (Array.isArray(list) ? list : [list]).map((r) => ({ id, ...r })))
  const skills = [...listSkills(join(configDir, 'skills'), 'user'), ...listSkills(join(projectDir, '.claude', 'skills'), 'project')]
  const scopeRank = { local: 3, project: 2, user: 1 }
  const integrations = registry.integrations.map((entry) => {
    const base = { id: entry.id, kind: entry.kind, group: entry.group ?? null, subcapability: entry.subcapability ?? null, invoke: entry.invoke, capabilities: entry.capabilities, license: entry.license, risk: entry.risk, runs: entry.runs, writes: entry.writes, preconditions: entry.preconditions ?? [], state: 'not-installed', version: null, scope: null, enabledBy: null, path: null, reasons: [], execution: 'not-run' }
    if (entry.match.pluginId) {
      const id = entry.match.pluginId
      const matching = records.filter((r) => r.id === id)
      const applicable = matching.filter((r) => r.scope === 'user' || samePath(r.projectPath, projectDir)).sort((a, b) => (scopeRank[b.scope] ?? 0) - (scopeRank[a.scope] ?? 0))
      const foreign = matching.filter((r) => !applicable.includes(r))
      if (foreign.length) base.reasons.push(`${foreign.length} record(s) of this plugin belong to another project (${foreign.map((r) => `${r.scope}: ${r.projectPath}`).join('; ')}) and are ignored here`)
      const rec = applicable[0]
      if (!rec) {
        const market = marketplaceListing(configDir, id)
        if (market) base.reasons.push(`listed in the ${market} marketplace: claude plugin install ${id} would make it available`)
        return base
      }
      base.scope = rec.scope
      base.path = rec.installPath ?? null
      base.version = rec.version ?? readJsonSafe(join(rec.installPath ?? '', '.claude-plugin', 'plugin.json'))?.version ?? null
      const enabled = resolveSetting(chain, 'enabledPlugins', id)
      base.enabledBy = enabled.source ? `${enabled.source} settings (${enabled.value})` : 'install record only (no explicit enabledPlugins entry read)'
      if (!rec.installPath || !existsSync(rec.installPath)) {
        base.state = 'not-cached'
        base.reasons.push('the install record points at a cache directory that does not exist')
      } else if (enabled.value === false) {
        base.state = 'disabled'
        base.reasons.push(`enabledPlugins is false in ${enabled.source} settings`)
      } else if (entry.minVersion && base.version && compareVersions(base.version, entry.minVersion) < 0) {
        base.state = 'obsolete'
        base.reasons.push(`version ${base.version} is below the minimum ${entry.minVersion} this registry knows`)
      } else base.state = 'available'
      return base
    }
    if (entry.match.skillName) {
      const wanted = entry.match.skillName.toLowerCase()
      const found = skills.filter((s) => s.name.toLowerCase() === wanted && !s.isPluginDir)
      // personal over project when both exist (documented resolution for same-named skills)
      const skill = found.find((s) => s.source === 'user') ?? found[0]
      if (!skill) return base
      if (found.length > 1) base.reasons.push(`also present as a ${found.filter((s) => s !== skill).map((s) => s.source).join(', ')} skill; the ${skill.source} copy wins`)
      base.scope = skill.source
      base.path = skill.dir
      base.version = skill.version
      const override = resolveSetting(chain, 'skillOverrides', skill.name)
      base.enabledBy = override.source ? `${override.source} settings skillOverrides (${override.value})` : 'present, no skillOverrides entry read'
      if (override.value === 'off') {
        base.state = 'disabled'
        base.reasons.push(`skillOverrides is "off" in ${override.source} settings: hidden from Claude and from the / menu`)
      } else if (MODEL_HIDDEN_OVERRIDES.has(override.value)) {
        base.state = 'hidden-from-model'
        base.reasons.push(`skillOverrides is "${override.value}" in ${override.source} settings: Claude cannot invoke it on its own; the user can`)
      } else if (entry.minVersion && base.version && compareVersions(base.version, entry.minVersion) < 0) {
        base.state = 'obsolete'
        base.reasons.push(`version ${base.version} is below the minimum ${entry.minVersion}`)
      } else {
        base.state = 'available'
        if (!base.version) base.reasons.push('no version in its frontmatter: compatibility with the registry notes is not verifiable')
      }
      return base
    }
    base.reasons.push('registry entry without a match rule')
    return base
  })
  // lookalikes: a skill directory named like a registry integration that is not the integration itself
  const registryNames = new Map(registry.integrations.map((e) => [e.id.toLowerCase(), e]))
  const lookalikes = []
  for (const s of skills) {
    const entry = registryNames.get(s.name.toLowerCase()) ?? registryNames.get(s.dirName.toLowerCase())
    if (!entry) continue
    if (entry.match.pluginId) lookalikes.push({ name: s.name, source: s.source, path: s.dir, note: `a ${s.source} skill named like the ${entry.match.pluginId} plugin; a name is not that plugin, so it is ignored` })
    else if (s.isPluginDir) lookalikes.push({ name: s.name, source: s.source, path: s.dir, note: 'a plugin directory inside a skills folder, not the standalone skill the registry describes; ignored' })
  }
  const pkg = readJsonSafe(join(projectDir, 'package.json'))
  const projectDeps = Object.keys({ ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) })
  const known = new Set(integrations.filter((i) => i.path).map((i) => realOrSelf(i.path)))
  const unlisted = skills.filter((s) => !known.has(realOrSelf(s.dir)) && !lookalikes.some((l) => l.path === s.dir)).map((s) => ({ name: s.name, source: s.source }))
  return { integrations, lookalikes, unlisted, projectDeps, settingsRead: chain.filter((s) => s.data).map((s) => s.scope), recordsRead: Boolean(installed), notRead: ['managed settings', '--settings and --plugin-dir of the running session', 'skills synced from claude.ai'] }
}

// ---------------------------------------------------------------- plan
const GSAP_GATE_RE = /\bgsap\b|scrolltrigger|scroll trigger|greensock/i

export function buildPlan(registry, needed, detection, { maxExternal = registry.policy?.maxExternalDefault ?? 1, task = '', projectDeps = detection?.projectDeps ?? [] } = {}) {
  const caps = registry.capabilities.filter((c) => needed.includes(c.id))
  const available = (detection?.integrations ?? []).filter((i) => i.state === 'available')
  const coverage = (i) => i.capabilities.filter((c) => needed.includes(c)).length
  const order = new Map(registry.integrations.map((e, idx) => [e.id, idx]))
  const entryOf = new Map(registry.integrations.map((e) => [e.id, e]))
  const rank = (a, b) => coverage(b) - coverage(a) || order.get(a.id) - order.get(b.id)
  const text = String(task ?? '').toLowerCase()
  const chosenGroups = new Set() // an integration without a group is its own group
  const groupOf = (i) => i.group ?? i.id
  const chosen = new Set()
  const threeDLed = needed.includes('3d-experience')
  const collaboratorOf = (c) => ({ id: c.id, invoke: c.invoke, version: c.version, scope: c.scope, risk: c.risk, preconditions: c.preconditions, subcapability: c.subcapability ?? null, execution: 'not-run', evidenceRequired: `a Skill tool invocation of "${c.invoke}" in this session and its result` })
  const rows = caps.map((cap) => {
    const row = { capability: cap.id, owner: cap.owner, coOwner: cap.coOwner ?? null, externalAllowed: Boolean(cap.externalAllowed), collaborator: null, coCollaborators: [], alternatives: [], deferred: [], fallback: `${cap.owner}${cap.coOwner ? ` with ${cap.coOwner}` : ''} (internal, always applies)` }
    if (!cap.externalAllowed) return row
    if (threeDLed) {
      row.externalAllowed = false
      row.fallback = `${row.fallback}; 3D-led experience: creative-frontend leads and the registry's design skills are not 3D-aware`
      return row
    }
    if (cap.externalGroup) {
      // a gated group (GSAP): only when the task names it or the project already depends on it
      const group = registry.groups?.[cap.externalGroup]
      const gateOpen = GSAP_GATE_RE.test(text) || projectDeps.includes('gsap') || projectDeps.includes('@gsap/react')
      if (!gateOpen) {
        row.externalAllowed = false
        row.fallback = `${row.fallback}; ${cap.externalGroup} skills are not consulted: the task does not name it and the project does not depend on it (CSS, View Transitions or Motion first)`
        return row
      }
      const members = available.filter((i) => i.group === cap.externalGroup && i.capabilities.includes(cap.id))
      const hits = (i) => {
        const when = entryOf.get(i.id)?.when ?? []
        let n = when.filter((w) => hasWord(text, w)).length
        if (i.id === 'gsap-react' && projectDeps.some((d) => /^(react|next)$/.test(d))) n++
        if (i.id === 'gsap-frameworks' && projectDeps.some((d) => /^(vue|nuxt|svelte|@sveltejs\/kit)$/.test(d))) n++
        return n
      }
      // one topic skill (scroll, timeline, performance, plugins, utils; the core skill when nothing is named) plus the
      // framework skill when the task or the project names the framework: lifecycle and cleanup live there
      const FRAMEWORK_SKILLS = new Set(['gsap-react', 'gsap-frameworks'])
      const byHits = (a, b) => hits(b) - hits(a) || order.get(a.id) - order.get(b.id)
      const topics = members.filter((i) => !FRAMEWORK_SKILLS.has(i.id) && hits(i) > 0).sort(byHits)
      const frameworks = members.filter((i) => FRAMEWORK_SKILLS.has(i.id) && hits(i) > 0).sort(byHits)
      const max = group?.maxPerPlan ?? 2
      const picked = []
      if (topics.length) picked.push(topics[0])
      else picked.push(...members.filter((i) => entryOf.get(i.id)?.fallback).slice(0, 1))
      if (frameworks.length && picked.length < max) picked.push(frameworks[0])
      for (const t of topics.slice(1)) if (picked.length < max) picked.push(t)
      const specific = [...topics, ...frameworks]
      const rest = members.filter((i) => !picked.includes(i))
      if (!picked.length) return row
      if (chosenGroups.has(cap.externalGroup) || chosenGroups.size < maxExternal) {
        chosenGroups.add(cap.externalGroup)
        for (const c of picked) chosen.add(c.id)
        row.collaborator = collaboratorOf(picked[0])
        row.coCollaborators = picked.slice(1).map(collaboratorOf)
        row.alternatives = rest.map((i) => i.id)
        row.selectionReason = topics.length || frameworks.length ? `sub-capability match (${picked.map((i) => `${i.id}: ${i.subcapability}`).join('; ')})` : 'nothing specific named: the core skill'
      } else row.deferred = picked.map((i) => i.id)
      return row
    }
    const candidates = available.filter((i) => i.capabilities.includes(cap.id) && !i.group).sort(rank)
    for (const c of candidates) {
      if (row.collaborator) {
        row.alternatives.push(c.id)
        continue
      }
      if (chosenGroups.has(groupOf(c)) || chosenGroups.size < maxExternal) {
        chosenGroups.add(groupOf(c))
        chosen.add(c.id)
        row.collaborator = collaboratorOf(c)
      } else row.deferred.push(c.id)
    }
    return row
  })
  return { needed, rows, selectedIntegrations: [...chosen], selectedGroups: [...chosenGroups], maxExternal, executionPolicy: registry.policy?.evidence ?? 'recommended, never run by this tool', precedence: registry.policy?.precedence ?? null }
}

// ---------------------------------------------------------------- CLI
export async function run(argv) {
  const args = parseArgs(argv, { booleans: ['no-detect'] })
  if (args.help) return usage(HELP)
  if (!args.task && !args.needs) return usage(HELP)
  let registry
  try {
    registry = loadRegistry()
  } catch (error) {
    return fail(`registry not readable: ${error.message}`)
  }
  const projectDir = resolve(String(args.project ?? args._[0] ?? process.cwd()))
  const configDir = resolve(String(args['config-dir'] ?? join(homedir(), '.claude')))
  const maxExternal = Math.max(0, Number(args['max-external'] ?? registry.policy?.maxExternalDefault ?? 1))
  const known = new Set(registry.capabilities.map((c) => c.id))
  let needed
  let inference = null
  if (args.needs) {
    const list = String(args.needs).split(',').map((s) => s.trim()).filter(Boolean)
    const bad = list.filter((c) => !known.has(c))
    if (bad.length) return fail(`unknown capabilities: ${bad.join(', ')} (known: ${[...known].join(', ')})`)
    const set = new Set(list)
    for (const cap of list) for (const implied of IMPLIES[cap] ?? []) set.add(implied)
    needed = registry.capabilities.map((c) => c.id).filter((c) => set.has(c))
  } else {
    inference = capabilitiesFor(String(args.task), registry)
    needed = inference.needed
  }
  const detection = args['no-detect'] ? null : detectIntegrations(registry, { configDir, projectDir })
  const plan = buildPlan(registry, needed, detection, { maxExternal, task: args.task ? String(args.task) : '', projectDeps: detection?.projectDeps ?? [] })

  const report = createReport('capabilities', { root: projectDir, framework: 'any', config: null, notes: [] })
  report.analysis = { engine: args['no-detect'] ? 'registry' : 'registry+settings', mode: args['no-detect'] ? 'plan-only' : 'plan+detect', configDir, projectDir, registry: { file: REGISTRY_FILE, version: registry.version, integrations: registry.integrations.map((e) => e.id) }, settingsRead: detection?.settingsRead ?? [], installRecordsRead: detection?.recordsRead ?? false, notRead: detection?.notRead ?? ['environment (--no-detect)'] }
  report.data = { task: args.task ? String(args.task) : null, explicit: args.needs ? String(args.needs) : null, inference, plan, integrations: detection?.integrations ?? [], lookalikes: detection?.lookalikes ?? [], unlisted: detection?.unlisted ?? [], projectDeps: (detection?.projectDeps ?? []).filter((d) => /gsap|vue|nuxt|react|next|svelte|three|lenis|motion/.test(d)) }
  const emit = (f) => addFinding(report, { level: 'info', severity: 'info', ...f })

  if (!needed.length) emit({ id: 'no-capability-recognised', message: 'no capability was recognised in the task text; pass --needs with the capabilities you mean', fix: 'example: --needs ui-implementation,accessibility-review' })
  for (const row of plan.rows) {
    for (const c of row.collaborator ? [row.collaborator, ...row.coCollaborators] : []) emit({ id: 'collaboration-selected', message: `${row.capability}: ${c.id} (${c.invoke}${c.version ? ` ${c.version}` : ''}, ${c.scope} scope, risk ${c.risk}${c.subcapability ? `, ${c.subcapability}` : ''}) is available and recommended alongside ${row.owner}; it has not been run${c.preconditions.length ? `; before invoking it: ${c.preconditions.join('; ')}` : ''}${row.selectionReason ? `; chosen by ${row.selectionReason}` : ''}`, fix: `invoke it with the Skill tool only if it appears in this session's skill list; keep the tool result as the evidence that it ran; the user's instructions and the project's conventions override its output` })
    if (row.alternatives.length) emit({ id: 'collaboration-overlap', message: `${row.capability}: ${row.alternatives.join(', ')} also cover it; ${row.collaborator?.id ?? 'the owner'} was chosen by coverage of the needed capabilities, then registry order (increasing risk)`, fix: 'pick the alternative explicitly if the user prefers it; never run both for the same capability' })
    if (row.deferred.length) emit({ id: 'collaboration-deferred', message: `${row.capability}: ${row.deferred.join(', ')} available but not selected (at most ${plan.maxExternal} external integration(s) per plan); ${row.owner} covers it`, fix: 'raise --max-external only when the user wants more than one collaborator' })
    if (row.externalAllowed && !row.collaborator && !row.deferred.length) emit({ id: 'external-fallback', message: `${row.capability}: no available external collaborator; ${row.fallback}`, fix: 'nothing to install is required; the internal skill is the owner' })
    if (!row.externalAllowed && /skills are not consulted/.test(row.fallback)) emit({ id: 'external-gated', message: `${row.capability}: ${row.fallback}`, fix: 'name the library in the task, or add it to the project first, if GSAP is really the right tool' })
  }
  if (needed.length && plan.rows.every((r) => !r.externalAllowed) && !plan.rows.some((r) => /skills are not consulted/.test(r.fallback))) emit({ id: 'no-external-collaboration', message: `the task needs ${needed.join(', ')} only: internal owners, no visual collaborator considered`, fix: 'keep the plan technical; do not add design skills to a technical change' })
  for (const i of detection?.integrations ?? []) {
    const relevant = i.capabilities.some((c) => needed.includes(c))
    if (i.state === 'disabled') emit({ id: 'integration-disabled', message: `${i.id} is installed but disabled for this project (${i.reasons.join('; ')}); it is not available and must not be invoked`, fix: 'leave it disabled unless the user enables it; a disabled skill is not a fallback' })
    else if (i.state === 'hidden-from-model') emit({ id: 'integration-hidden', message: `${i.id}: ${i.reasons.join('; ')}`, fix: 'the user can run it by name; the plan does not select it' })
    else if (i.state === 'obsolete') emit({ id: 'integration-obsolete', message: `${i.id} ${i.version} is older than the version the registry describes (${i.reasons.join('; ')}); not selected`, fix: 'update it with claude plugin update, or accept that its behaviour may differ from the registry notes' })
    else if (i.state === 'not-cached') emit({ id: 'integration-not-cached', message: `${i.id}: ${i.reasons.join('; ')}`, fix: 'reinstall or update the plugin; a record without files cannot run' })
    else if (i.state === 'not-installed' && relevant) emit({ id: 'integration-not-installed', message: `${i.id} would cover ${i.capabilities.filter((c) => needed.includes(c)).join(', ')} but is not installed${i.reasons.length ? ` (${i.reasons.join('; ')})` : ''}`, fix: 'optional; the internal owner continues without it' })
  }
  for (const l of detection?.lookalikes ?? []) emit({ id: 'integration-lookalike', level: 'heuristic', severity: 'low', message: `${l.name} (${l.source}): ${l.note}`, fix: 'a name match is not availability; install the integration from its marketplace if it is wanted' })

  report.summary = { capabilities: needed.length, needed: needed.join(','), externalAllowed: plan.rows.filter((r) => r.externalAllowed).length, selected: plan.selectedIntegrations.join(',') || 'none', available: (detection?.integrations ?? []).filter((i) => i.state === 'available').map((i) => i.id).join(',') || 'none', disabled: (detection?.integrations ?? []).filter((i) => i.state === 'disabled').length, obsolete: (detection?.integrations ?? []).filter((i) => i.state === 'obsolete').length, lookalikes: detection?.lookalikes.length ?? 0, unlisted: detection?.unlisted.length ?? 0, executed: 'none (this tool never runs a skill)' }
  report.notes.push(`Nothing here ran a skill. "selected" means available in this environment and recommended; execution is only what the session shows as a Skill tool invocation with its result. Managed settings, --plugin-dir plugins and claude.ai-synced skills were not read.`)
  if (inference?.notes.length) report.notes.push(...inference.notes.map((n) => `inference: ${n}`))
  return finish(report, args, {
    sections: [
      { title: 'Plan', table: { headers: ['capability', 'owner', 'external', 'collaborator', 'state'], rows: plan.rows.map((r) => [r.capability, r.owner + (r.coOwner ? ` + ${r.coOwner}` : ''), r.externalAllowed ? 'allowed' : 'internal only', r.collaborator ? [r.collaborator, ...(r.coCollaborators ?? [])].map((c) => `${c.id} (${c.invoke})`).join(', ') : r.deferred.length ? `deferred: ${r.deferred.join(', ')}` : '-', r.collaborator ? 'available, not run' : 'internal owner']) } },
      { title: 'Integrations', table: { headers: ['integration', 'kind', 'state', 'version', 'scope', 'risk'], rows: (detection?.integrations ?? []).map((i) => [i.id, i.kind, i.state, i.version ?? '-', i.scope ?? '-', i.risk]) } },
    ],
  })
}

if (isMainModule(import.meta.url)) run(process.argv.slice(2)).then((code) => { process.exitCode = code }, (error) => { process.stderr.write(`error: ${error?.stack ?? error}\n`); process.exitCode = 2 })
