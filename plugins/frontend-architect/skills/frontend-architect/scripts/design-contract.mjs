#!/usr/bin/env node
// Validates a design contract (the written outcome of the visual-direction method: product, audience, requirements,
// a direction statement, decisions that cite requirements, and the scales and colour roles that become tokens) and
// emits its tokens. Read-only: it prints to stdout, the caller decides where the CSS goes.
//
// Usage: design-contract.mjs <contract.json> [--emit css|tailwind|nuxt-ui|dtcg] [--role-prefix p] [--scope sel] [--json|--md] [--fail-on level]
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { contrast, over, parseColor, ramp, toHex } from './lib/color.mjs'
import { addFinding, createReport, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'

const HELP = `
design-contract — validates a design contract and emits its tokens (CSS variables, Tailwind v4 theme, Nuxt UI
mapping, DTCG JSON). The contract is what the visual-direction method writes down; the tool proves what a file can
prove: every decision cites a requirement, the scales are on their grid, every semantic colour pair meets WCAG 2.2
in the light and the dark theme, the focus ring and target sizes meet their floors. Whether the direction is right
for the product stays with people.

usage: node design-contract.mjs <contract.json> [options]
  --emit <format>     print the tokens instead of the validation report:
                        css       :root / .dark custom properties (ramps, roles, type, spacing, radius, shadow, motion)
                        tailwind  the same as a Tailwind v4 stylesheet (@theme for ramps and scales, roles in :root/.dark
                                  and an @theme inline block so bg-canvas, text-fg, border-border... exist as utilities)
                        nuxt-ui   the CSS that maps Nuxt UI's --ui-* variables onto the roles, plus the app.config colours
                        dtcg      Design Tokens Format Module (2025.10 draft) JSON with aliases
  --role-prefix <p>   (tailwind) prefix for the role variables and utilities when the host library owns the plain
                      names (shadcn's --accent is a hover surface): --role-prefix dc- gives --dc-accent and bg-dc-canvas
  --scope <selector>  (tailwind) emit the variables as overrides under a selector instead of a global @theme, for a
                      second contract inside an app owned by another: --scope '[data-contract="lumen"]'
  --nuxt-ui-neutral <name>  (tailwind) also emit the neutral ramp under this palette name (default none; the Nuxt UI
                      mapping expects contract-neutral): Nuxt UI keeps "neutral" for Tailwind's own grey
  --json | --md       report format
  --fail-on <level>   exit 1 on: confirmed (default) | any | none

Findings: contract-missing-section, direction-statement-too-long, decision-without-requirement (confirmed),
requirement-without-decision, area-without-decision (heuristic), spacing-off-grid, semantic-role-missing,
semantic-reference-unresolved, contrast-pair-below, focus-ring-too-thin, target-size-below, reduced-motion-undecided
(confirmed), type-scale-ratio-unusual, generic-accent-hue (heuristic).
`

export const REQUIRED_SECTIONS = ['name', 'product', 'audience', 'requirements', 'direction', 'decisions', 'typography', 'spacing', 'color']
export const DECISION_AREAS = ['typography', 'color', 'spacing', 'layout', 'density', 'radius', 'elevation', 'motion', 'imagery', 'states', 'dark-mode', 'accessibility', 'responsive']
export const ROLES = ['canvas', 'surface', 'surface-raised', 'fg', 'fg-muted', 'border', 'border-strong', 'accent', 'accent-fg', 'accent-hover', 'focus', 'success', 'success-fg', 'warning', 'warning-fg', 'danger', 'danger-fg', 'info', 'info-fg']
/** [foreground, background, minimum ratio, what it is]: text 4.5, non-text 3 (SC 1.4.3, 1.4.11). */
export const DEFAULT_PAIRS = [
  ['fg', 'canvas', 4.5, 'body text on the page'],
  ['fg', 'surface', 4.5, 'body text on a surface'],
  ['fg', 'surface-raised', 4.5, 'body text on a raised surface'],
  ['fg-muted', 'canvas', 4.5, 'secondary text on the page'],
  ['fg-muted', 'surface', 4.5, 'secondary text on a surface'],
  ['accent-fg', 'accent', 4.5, 'label on the primary action'],
  ['accent-fg', 'accent-hover', 4.5, 'label on the hovered primary action'],
  ['accent', 'canvas', 4.5, 'accent used as text or link on the page'],
  ['accent', 'surface', 4.5, 'accent used as text or link on a surface'],
  // `border` separates regions (decorative: no ratio); `border-strong` is the boundary of a control or the only
  // indicator of a component, which SC 1.4.11 holds to 3:1
  ['border-strong', 'canvas', 3, 'control boundary on the page'],
  ['border-strong', 'surface', 3, 'control boundary on a surface'],
  ['focus', 'canvas', 3, 'focus ring on the page'],
  ['focus', 'surface', 3, 'focus ring on a surface'],
  ['success-fg', 'success', 4.5, 'label on a success surface'],
  ['warning-fg', 'warning', 4.5, 'label on a warning surface'],
  ['danger-fg', 'danger', 4.5, 'label on a danger surface'],
  ['info-fg', 'info', 4.5, 'label on an info surface'],
  ['success', 'canvas', 3, 'success as a non-text indicator'],
  ['warning', 'canvas', 3, 'warning as a non-text indicator'],
  ['danger', 'canvas', 4.5, 'danger used as text (error messages)'],
  ['info', 'canvas', 3, 'info as a non-text indicator'],
]
const STATUS_SEEDS = { success: '#2f8a5b', warning: '#b8791f', danger: '#c23b3b', info: '#2b6fc9' }

export function loadContract(file) {
  const text = readFileSync(file, 'utf8')
  return JSON.parse(text)
}

/** Ramps of the contract: accent, neutral (tinted from the accent unless a seed is given), one per status colour. */
export function buildRamps(contract) {
  const color = contract.color ?? {}
  const ramps = {}
  if (color.accent) ramps.accent = color.ramps?.accent ?? ramp(color.accent)
  const neutral = color.neutral
  if (typeof neutral === 'string') ramps.neutral = ramp(neutral, { chromaScale: 1 })
  else if (neutral && typeof neutral === 'object') ramps.neutral = color.ramps?.neutral ?? ramp(neutral.seed ?? color.accent, { chromaScale: neutral.chroma ?? 0.1 })
  else if (color.accent) ramps.neutral = color.ramps?.neutral ?? ramp(color.accent, { chromaScale: 0.1 })
  for (const [name, seed] of Object.entries({ ...STATUS_SEEDS, ...(color.status ?? {}) })) ramps[name] = color.ramps?.[name] ?? ramp(seed)
  for (const [name, custom] of Object.entries(color.ramps ?? {})) if (!ramps[name]) ramps[name] = custom
  return ramps
}

/** Resolves a role value: a literal colour, or a reference `{ramp.step}` into the ramps. */
export function resolveColor(value, ramps) {
  if (typeof value !== 'string') return { error: `not a string: ${JSON.stringify(value)}` }
  const m = value.match(/^\{([a-z0-9-]+)\.(\d{2,3})\}$/i)
  if (m) {
    const hex = ramps[m[1]]?.[m[2]]
    return hex ? { hex, ref: value } : { error: `unknown ramp step ${value}` }
  }
  const parsed = parseColor(value)
  return parsed ? { hex: toHex(parsed), alpha: parsed.a } : { error: `unparsable colour ${value}` }
}

export function resolveRoles(contract, ramps) {
  const out = { light: {}, dark: {} }
  const errors = []
  for (const theme of ['light', 'dark']) {
    const roles = contract.color?.roles?.[theme]
    if (!roles) continue
    for (const [role, value] of Object.entries(roles)) {
      const r = resolveColor(value, ramps)
      if (r.error) errors.push({ theme, role, error: r.error })
      else out[theme][role] = r
    }
  }
  return { roles: out, errors }
}

/** Fluid type: clamp() between the size at minViewport and the size at maxViewport, both from the scale. */
export function typeSizes(typography) {
  const ratio = typography.ratio ?? 1.2
  const baseRem = typography.baseRem ?? 1
  const steps = typography.steps ?? { xs: -2, sm: -1, base: 0, lg: 1, xl: 2, '2xl': 3, '3xl': 4, '4xl': 5, display: 6 }
  const fluid = typography.fluid ?? null
  const out = {}
  for (const [name, step] of Object.entries(steps)) {
    const size = baseRem * ratio ** step
    if (fluid && step >= (fluid.fromStep ?? 1)) {
      // the large sizes grow with the viewport: the same step at the small end uses the fluid.minRatio (a tighter scale)
      const minRatio = fluid.minRatio ?? Math.min(ratio, 1.15)
      const min = baseRem * minRatio ** step
      const max = size
      const minVw = fluid.minViewport ?? 320
      const maxVw = fluid.maxViewport ?? 1440
      const slope = ((max - min) * 16) / (maxVw - minVw) // rem per px of viewport
      const intercept = min - (slope * minVw) / 16
      out[name] = { rem: Number(max.toFixed(4)), css: `clamp(${min.toFixed(4)}rem, ${intercept.toFixed(4)}rem + ${(slope * 100).toFixed(4)}vw, ${max.toFixed(4)}rem)`, min: Number(min.toFixed(4)), max: Number(max.toFixed(4)) }
    } else out[name] = { rem: Number(size.toFixed(4)), css: `${size.toFixed(4)}rem`, min: Number(size.toFixed(4)), max: Number(size.toFixed(4)) }
  }
  return out
}

const shadowCss = (level, color = '0 0 0') => (level.layers ?? [level]).map((l) => `${l.x ?? 0}px ${l.y}px ${l.blur}px ${l.spread ?? 0}px rgb(${color} / ${l.alpha})`).join(', ')

/** Validation: structure, traceability, scales, roles, contrast in both themes, state floors. */
export function validateContract(contract, file = 'contract.json') {
  const report = createReport('design-contract', { root: resolve(file), framework: 'design', notes: [] })
  const add = (f) => addFinding(report, { file: basename(file), ...f })
  for (const section of REQUIRED_SECTIONS) if (contract[section] === undefined) add({ id: 'contract-missing-section', level: 'confirmed', severity: 'high', message: `section "${section}" is missing`, section })
  const statement = String(contract.direction?.statement ?? '')
  const lines = statement.split('\n').filter((l) => l.trim()).length
  if (statement && (lines > 3 || statement.length > 320)) add({ id: 'direction-statement-too-long', level: 'confirmed', severity: 'medium', message: `the direction statement has ${lines} lines / ${statement.length} characters; three lines is the method's ceiling so every later choice can answer to it` })
  const requirementIds = new Set((contract.requirements ?? []).map((r) => r.id))
  const cited = new Set()
  const areas = new Set()
  for (const [i, d] of (contract.decisions ?? []).entries()) {
    areas.add(d.area)
    const because = Array.isArray(d.because) ? d.because : []
    const unknown = because.filter((id) => !requirementIds.has(id))
    if (!because.length || unknown.length) add({ id: 'decision-without-requirement', level: 'confirmed', severity: 'high', message: `decision ${i + 1} (${d.area}: "${String(d.choice).slice(0, 60)}") ${because.length ? `cites unknown requirement(s) ${unknown.join(', ')}` : 'cites no requirement'}`, decision: i + 1 })
    for (const id of because) cited.add(id)
  }
  const uncited = [...requirementIds].filter((id) => !cited.has(id))
  if (uncited.length) add({ id: 'requirement-without-decision', level: 'heuristic', severity: 'medium', message: `requirement(s) ${uncited.join(', ')} drive no decision: either they are not visual requirements (say so in the contract) or a decision is missing` })
  const missingAreas = DECISION_AREAS.filter((a) => !areas.has(a))
  if (missingAreas.length) add({ id: 'area-without-decision', level: 'heuristic', severity: 'low', message: `no decision recorded for: ${missingAreas.join(', ')} (defaults are decisions too; write the one-liner)` })
  const ratio = contract.typography?.ratio
  if (ratio !== undefined && (ratio < 1.067 || ratio > 1.5)) add({ id: 'type-scale-ratio-unusual', level: 'heuristic', severity: 'low', message: `type scale ratio ${ratio} is outside 1.067–1.5 (minor second to perfect fifth); fine if intended` })
  const base = contract.spacing?.base
  for (const v of contract.spacing?.scale ?? []) if (base && v % base !== 0) add({ id: 'spacing-off-grid', level: 'confirmed', severity: 'medium', message: `spacing value ${v}px is not a multiple of the ${base}px base` })
  const ramps = buildRamps(contract)
  const { roles, errors } = resolveRoles(contract, ramps)
  for (const e of errors) add({ id: 'semantic-reference-unresolved', level: 'confirmed', severity: 'high', message: `${e.theme}.${e.role}: ${e.error}` })
  const themes = contract.darkMode === false ? ['light'] : ['light', 'dark']
  for (const theme of themes) {
    const missing = ROLES.filter((r) => !roles[theme][r])
    if (missing.length) add({ id: 'semantic-role-missing', level: 'confirmed', severity: 'high', message: `${theme} theme lacks role(s) ${missing.join(', ')}`, theme })
  }
  const pairs = contract.color?.pairs ?? DEFAULT_PAIRS
  const matrix = []
  for (const theme of themes) {
    for (const [fgRole, bgRole, min, what] of pairs) {
      const fg = roles[theme][fgRole]
      const bg = roles[theme][bgRole]
      if (!fg || !bg) continue
      const bgColor = parseColor(bg.hex)
      const fgColor = over({ ...parseColor(fg.hex), a: fg.alpha ?? 1 }, bgColor)
      const ratioValue = Number(contrast(fgColor, bgColor).toFixed(2))
      matrix.push({ theme, fg: fgRole, bg: bgRole, ratio: ratioValue, required: min, what, passes: ratioValue >= min })
      if (ratioValue < min) add({ id: 'contrast-pair-below', level: 'confirmed', severity: min >= 4.5 ? 'high' : 'medium', message: `${theme}: ${fgRole} on ${bgRole} is ${ratioValue}:1, ${what} needs ${min}:1 (${fg.hex} on ${bg.hex})`, theme, pair: [fgRole, bgRole], ratio: ratioValue, required: min })
    }
  }
  const ring = contract.states?.focusRing
  if (ring && (ring.width ?? 0) < 2) add({ id: 'focus-ring-too-thin', level: 'confirmed', severity: 'medium', message: `focus ring width ${ring.width}px; 2px is the floor for a ring that reads over content (SC 2.4.13 asks for a 2px-equivalent area)` })
  if (contract.states && contract.states.minTarget !== undefined && contract.states.minTarget < 24) add({ id: 'target-size-below', level: 'confirmed', severity: 'medium', message: `minimum target ${contract.states.minTarget}px is below the 24px of SC 2.5.8` })
  if (contract.motion && !contract.motion.reducedMotion) add({ id: 'reduced-motion-undecided', level: 'confirmed', severity: 'medium', message: 'motion is specified but the reduced-motion policy is not ("cut" or "minimal")' })
  const accent = contract.color?.accent ? parseColor(contract.color.accent) : null
  if (accent) {
    const { h } = hueOf(accent)
    if (h >= 262 && h <= 300) add({ id: 'generic-accent-hue', level: 'heuristic', severity: 'low', message: `the accent sits in the violet band (hue ${h.toFixed(0)}°) that generated interfaces default to; keep it only if the brand owns it and the colour decision says so` })
  }
  report.summary = { requirements: requirementIds.size, decisions: (contract.decisions ?? []).length, decisionsCitingRequirements: (contract.decisions ?? []).filter((d) => Array.isArray(d.because) && d.because.length && d.because.every((id) => requirementIds.has(id))).length, areasCovered: DECISION_AREAS.filter((a) => areas.has(a)).length, areasTotal: DECISION_AREAS.length, pairsChecked: matrix.length, pairsBelow: matrix.filter((m) => !m.passes).length, themes, ramps: Object.keys(ramps), findings: report.findings.length, confirmed: report.findings.filter((f) => f.level === 'confirmed').length }
  report.data = { matrix, ramps, roles: Object.fromEntries(themes.map((t) => [t, Object.fromEntries(Object.entries(roles[t]).map(([k, v]) => [k, v.hex]))])), typeSizes: contract.typography ? typeSizes(contract.typography) : {} }
  return report
}

function hueOf(rgb) {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: ((h * 60) + 360) % 360, s: max ? d / max : 0 }
}

// ---- emitters ----

const kebab = (s) => String(s).replace(/[^a-z0-9-]/gi, '-').toLowerCase()
const remOf = (px) => `${Number((px / 16).toFixed(4))}rem`

function tokenSet(contract) {
  const ramps = buildRamps(contract)
  const { roles } = resolveRoles(contract, ramps)
  const t = contract.typography ?? {}
  const sizes = typeSizes(t)
  const spacing = contract.spacing ?? { base: 4, scale: [] }
  const radius = contract.radius?.scale ?? {}
  const levels = contract.elevation?.levels ?? []
  const motion = contract.motion ?? {}
  const layout = contract.layout ?? {}
  return { ramps, roles, sizes, t, spacing, radius, levels, motion, layout, states: contract.states ?? {} }
}

function cssLines(contract, { prefixRoles = true, rolePrefix = '' } = {}) {
  const { ramps, roles, sizes, t, spacing, radius, levels, motion, layout, states } = tokenSet(contract)
  const root = []
  for (const [name, steps] of Object.entries(ramps)) for (const [step, hex] of Object.entries(steps)) root.push(`--color-${kebab(name)}-${step}: ${hex};`)
  for (const [fam, stack] of Object.entries(t.families ?? {})) root.push(`--font-${kebab(fam)}: ${(Array.isArray(stack) ? stack : [stack]).map((f) => (/\s/.test(f) && !/^['"]/.test(f) ? `"${f}"` : f)).join(', ')};`)
  for (const [name, s] of Object.entries(sizes)) root.push(`--text-${kebab(name)}: ${s.css};`)
  for (const [name, v] of Object.entries(t.lineHeights ?? {})) root.push(`--leading-${kebab(name)}: ${v};`)
  for (const [name, v] of Object.entries(t.weights ?? {})) root.push(`--font-weight-${kebab(name)}: ${v};`)
  if (t.tabularNumbers) root.push(`--font-numeric: tabular-nums;`)
  // the contract's base is not written to --spacing: Tailwind multiplies every spacing utility by that unit, so a
  // contract on an 8px grid would double p-4 and gap-10 for the host library's components too (a 1280px page overflowed
  // by 608px when the launch page's scoped tokens did); the base governs the --space-* tokens and the off-grid rule
  for (const v of spacing.scale ?? []) root.push(`--space-${v}: ${remOf(v)};`)
  for (const [name, px] of Object.entries(radius)) root.push(`--radius-${kebab(name)}: ${px >= 9999 ? '9999px' : remOf(px)};`)
  for (const level of levels) root.push(`--shadow-${kebab(level.name)}: ${shadowCss(level, contract.elevation?.color ?? '0 0 0')};`)
  for (const [name, ms] of Object.entries(motion.durations ?? {})) root.push(`--duration-${kebab(name)}: ${ms}ms;`)
  for (const [name, bez] of Object.entries(motion.easings ?? {})) root.push(`--ease-${kebab(name)}: cubic-bezier(${bez.join(', ')});`)
  for (const [name, px] of Object.entries(layout.breakpoints ?? {})) root.push(`--breakpoint-${kebab(name)}: ${remOf(px)};`)
  if (layout.container) root.push(`--container-page: ${remOf(layout.container)};`)
  if (layout.sidebar) root.push(`--sidebar-width: ${remOf(layout.sidebar)};`)
  if (layout.gutter) root.push(`--gutter: ${remOf(layout.gutter)};`)
  if (states.focusRing) root.push(`--focus-ring-width: ${states.focusRing.width}px;`, `--focus-ring-offset: ${states.focusRing.offset ?? 2}px;`)
  if (states.minTarget) root.push(`--target-min: ${states.minTarget}px;`)
  if (states.disabledOpacity !== undefined) root.push(`--disabled-opacity: ${states.disabledOpacity};`)
  const roleLines = (theme) => Object.entries(roles[theme] ?? {}).map(([role, v]) => `--${prefixRoles ? 'color-' : ''}${rolePrefix}${role}: ${v.hex};`)
  return { root, light: roleLines('light'), dark: roleLines('dark') }
}

export function emitCss(contract) {
  const { root, light, dark } = cssLines(contract)
  const block = (sel, lines) => (lines.length ? `${sel} {\n  ${lines.join('\n  ')}\n}\n` : '')
  return `/* design contract "${contract.name}" v${contract.version ?? 1}: generated by design-contract.mjs, do not edit */\n` + block(':root', [...root, ...light]) + block('.dark, [data-theme="dark"]', dark)
}

/**
 * Tailwind v4: scales in @theme (utilities), roles as plain variables per theme, @theme inline to expose them as colours.
 * With `scope` (a selector) the same variables are emitted as overrides under that selector only: a second contract can
 * live in one area of an app whose @theme belongs to another contract; utilities keep working because Tailwind v4 reads
 * theme values through var(), so the ramps, scales and roles change inside the scope and nowhere else. Sizes the first
 * contract does not define (a display step) are reached with arbitrary values (text-(length:--text-display)).
 */
export function emitTailwind(contract, { rolePrefix = '', darkVariant = true, scope = '', nuxtUiNeutralAlias = '' } = {}) {
  const { root, light, dark } = cssLines(contract, { prefixRoles: false, rolePrefix })
  const roleNames = Object.keys(contract.color?.roles?.light ?? {})
  const block = (sel, lines) => (lines.length ? `${sel} {\n  ${lines.join('\n  ')}\n}\n` : '')
  if (scope) {
    return (
      `/* design contract "${contract.name}" v${contract.version ?? 1}: generated by design-contract.mjs, do not edit; scoped to ${scope} (the host theme stays outside it) */\n` +
      block(scope, [...root, ...light]) +
      block(`${scope}.dark, .dark ${scope}, ${scope}[data-theme="dark"], [data-theme="dark"] ${scope}`, dark)
    )
  }
  // Tailwind v4 drops @theme variables no utility references; a token layer is also read at runtime through var()
  // (Nuxt UI's generated colour aliases, shadcn's aliases, the design page), so the theme is static: every variable
  // is emitted whether or not a class uses it. Found when --ui-color-error-500 resolved to nothing and the "Late" badge
  // lost its colour: no utility used --color-danger-500, so Tailwind had removed it.
  const neutralAlias = nuxtUiNeutralAlias ? Object.entries(tokenSet(contract).ramps.neutral ?? {}).map(([step, hex]) => `--color-${nuxtUiNeutralAlias}-${step}: ${hex};`) : []
  return (
    `/* design contract "${contract.name}" v${contract.version ?? 1}: generated by design-contract.mjs, do not edit${rolePrefix ? `; roles prefixed "${rolePrefix}" because the host library owns the plain names` : ''} */\n` +
    block('@theme static', [...root, ...neutralAlias]) +
    block(':root', light) +
    block('.dark, [data-theme="dark"]', dark) +
    block('@theme inline', roleNames.map((r) => `--color-${rolePrefix}${r}: var(--${rolePrefix}${r});`)) +
    (darkVariant ? `@custom-variant dark (&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *));\n` : '')
  )
}

/** Nuxt UI 4: its --ui-* variables follow the roles; app.config maps its semantic colours onto the ramps. */
export function emitNuxtUi(contract) {
  // [data-contract] re-declares the mapping inside a scoped second contract (--scope), so Nuxt UI follows that contract's
  // roles there: a custom property resolves its var() where it is declared, not where it is used. The status colours map
  // to the contract's roles (the step that passes 4.5:1 as text in each theme), not to Nuxt UI's default 500/400 step:
  // a subtle badge's text is small, and the 500 step of the danger ramp read 3.18:1 on its tint.
  const css = `/* design contract "${contract.name}": Nuxt UI variables follow the contract's roles (light and dark through the role variables) */
:root, .dark, [data-contract] {
  --ui-bg: var(--canvas);
  --ui-bg-muted: var(--surface);
  --ui-bg-elevated: var(--surface-raised);
  --ui-bg-accented: var(--surface-raised);
  --ui-text: var(--fg);
  --ui-text-highlighted: var(--fg);
  --ui-text-muted: var(--fg-muted);
  --ui-text-dimmed: var(--fg-muted);
  --ui-border: var(--border);
  --ui-border-muted: var(--border);
  --ui-border-accented: var(--border-strong);
  --ui-primary: var(--accent);
  --ui-success: var(--success);
  --ui-warning: var(--warning);
  --ui-error: var(--danger);
  --ui-info: var(--info);
  --ui-radius: var(--radius-md);
}
`
  const appConfig = `// app.config.ts (Nuxt UI 4): semantic colours map onto the Tailwind colour names the contract's ramps define
export default defineAppConfig({
  // "neutral" names Tailwind's own grey to Nuxt UI (it keeps that palette as old-neutral): the contract's tinted neutral
  // ramp is emitted a second time as contract-neutral (emitTailwind with nuxtUiNeutralAlias) and mapped from there
  ui: { colors: { primary: 'accent', secondary: 'contract-neutral', neutral: 'contract-neutral', success: 'success', warning: 'warning', error: 'danger', info: 'info' } },
})
`
  return `${css}\n/*\n${appConfig}*/\n`
}

/** DTCG 2025.10 draft: $type / $value, groups, aliases in braces; fluid sizes carry min and max plus the clamp in $extensions. */
export function emitDtcg(contract) {
  const { ramps, sizes, t, spacing, radius, levels, motion, layout } = tokenSet(contract)
  const colorToken = (hex) => { const c = parseColor(hex); return { $type: 'color', $value: { colorSpace: 'srgb', components: [c.r / 255, c.g / 255, c.b / 255].map((v) => Number(v.toFixed(4))), hex } } }
  const dim = (value, unit = 'rem') => ({ $type: 'dimension', $value: { value: Number(value), unit } })
  const out = { $description: `design contract "${contract.name}" v${contract.version ?? 1}`, color: {}, font: {}, size: {}, space: {}, radius: {}, shadow: {}, motion: {}, layout: {} }
  for (const [name, steps] of Object.entries(ramps)) out.color[name] = Object.fromEntries(Object.entries(steps).map(([s, hex]) => [s, colorToken(hex)]))
  out.color.role = {}
  for (const theme of ['light', 'dark']) {
    out.color.role[theme] = {}
    for (const [role, value] of Object.entries(contract.color?.roles?.[theme] ?? {})) {
      const m = String(value).match(/^\{([a-z0-9-]+)\.(\d{2,3})\}$/i)
      out.color.role[theme][role] = m ? { $type: 'color', $value: `{color.${m[1]}.${m[2]}}` } : colorToken(toHex(parseColor(value)))
    }
  }
  for (const [fam, stack] of Object.entries(t.families ?? {})) out.font[fam] = { $type: 'fontFamily', $value: Array.isArray(stack) ? stack : [stack] }
  for (const [name, w] of Object.entries(t.weights ?? {})) out.font[`weight-${name}`] = { $type: 'fontWeight', $value: w }
  for (const [name, s] of Object.entries(sizes)) out.size[name] = s.min === s.max ? dim(s.rem) : { ...dim(s.max), $extensions: { 'com.frontend-architect.fluid': { min: { value: s.min, unit: 'rem' }, max: { value: s.max, unit: 'rem' }, css: s.css } } }
  for (const v of spacing.scale ?? []) out.space[String(v)] = dim(v / 16)
  for (const [name, px] of Object.entries(radius)) out.radius[name] = dim(px >= 9999 ? 9999 : px / 16, px >= 9999 ? 'px' : 'rem')
  for (const level of levels) out.shadow[level.name] = { $type: 'shadow', $value: (level.layers ?? [level]).map((l) => ({ color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: l.alpha }, offsetX: { value: l.x ?? 0, unit: 'px' }, offsetY: { value: l.y, unit: 'px' }, blur: { value: l.blur, unit: 'px' }, spread: { value: l.spread ?? 0, unit: 'px' } })) }
  for (const [name, ms] of Object.entries(motion.durations ?? {})) out.motion[`duration-${name}`] = { $type: 'duration', $value: { value: ms, unit: 'ms' } }
  for (const [name, bez] of Object.entries(motion.easings ?? {})) out.motion[`ease-${name}`] = { $type: 'cubicBezier', $value: bez }
  for (const [name, px] of Object.entries(layout.breakpoints ?? {})) out.layout[`breakpoint-${name}`] = dim(px, 'px')
  if (layout.container) out.layout.container = dim(layout.container, 'px')
  return JSON.stringify(out, null, 2)
}

export function emit(contract, format, options = {}) {
  if (format === 'css') return emitCss(contract)
  if (format === 'tailwind') return emitTailwind(contract, options)
  if (format === 'nuxt-ui') return emitNuxtUi(contract)
  if (format === 'dtcg') return emitDtcg(contract)
  throw new Error(`unknown --emit format ${format}`)
}

if (isMainModule(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args._[0]) process.exit(usage(HELP))
  let contract
  try {
    contract = loadContract(args._[0])
  } catch (e) {
    process.exit(fail(`cannot read contract ${args._[0]}: ${e.message}`))
  }
  if (args.emit) {
    try {
      process.stdout.write(emit(contract, String(args.emit), { rolePrefix: args['role-prefix'] ? String(args['role-prefix']) : '', scope: args.scope ? String(args.scope) : '', nuxtUiNeutralAlias: args['nuxt-ui-neutral'] ? String(args['nuxt-ui-neutral']) : '' }))
      process.exit(0)
    } catch (e) {
      process.exit(fail(e.message))
    }
  }
  const report = validateContract(contract, args._[0])
  process.exit(finish(report, args, { sections: [] }))
}
