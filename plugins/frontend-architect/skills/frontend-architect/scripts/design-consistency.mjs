#!/usr/bin/env node
// Design consistency audit: where the UI code departs from its token layer. Literal colours, sizes, font families,
// shadows, durations and z-indexes in class attributes (Tailwind arbitrary values), inline styles and component
// stylesheets are found lexically and classified: a defect the file proves (a literal where a token exists), a
// heuristic worth reading (an on-grid arbitrary size, a shadow, a duration), or a recommendation (too many distinct
// literal colours). Imagery (SVG fills and strokes) is reported as information, never as a defect: a drawing has its
// own colours. What no file can prove (hierarchy, pairing, brand fit, copy) is listed as human judgement. Read-only.
//
// Usage: design-consistency.mjs <project-root> [--contract contract.json] [--allow '#f3efe8,#fff'] [--json|--md] [--fail-on level]
import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { rel, walk } from './lib/fs.mjs'
import { detectProject, excludeArg, excludedBy, loadConfig, sourceFiles } from './lib/project.mjs'
import { addFinding, createReport, fail, finish, isMainModule, parseArgs, usage } from './lib/report.mjs'

const HELP = `
design-consistency — literals in the UI code where the design tokens should be (static level).

usage: node design-consistency.mjs <project-root> [options]
  --contract <file>   the design contract: its spacing base decides what is off-grid (default base 4 px)
  --allow <list>      comma-separated colour literals that are documented exceptions (also "designConsistency.allow"
                      in .frontend-audit.json): reported as information, not as defects
  --exclude <globs>   comma-separated project-relative globs to leave out (also "exclude" in .frontend-audit.json)
  --json | --md       output format
  --fail-on <level>   exit 1 on: confirmed (default) | any | none

What is scanned: .vue, .tsx, .jsx, .css, .scss files under the project (not node_modules, build output, generated token
files named tokens*.css or *-map.css). Where: class attributes (Tailwind arbitrary values such as bg-[#ff0000],
p-[13px], font-[Comic], shadow-[...], duration-[300ms], z-[999]), inline styles (style="color: #333", style={{ color:
'#333' }}), and stylesheet rules (<style> blocks, .css files) with colours, font-family, font-size in px, box-shadow,
transition durations and z-index. Values that go through var(--token) are never reported.

Classes (every finding carries "class"):
  defect          level confirmed: a literal colour or font family where the project has a token layer (@theme or
                  --color-* variables found), or a size off the contract's grid
  heuristic       level heuristic: an on-grid arbitrary size, a literal shadow, duration or z-index, a token defined
                  locally in a component stylesheet, a font-size in px; read it before deciding
  recommendation  level info: a pattern across files (more than six distinct literal colours, more than ten arbitrary
                  sizes): consolidate into the scale, or extend the contract
  imagery         level info: a colour inside <svg> or in fill/stroke/stop-color attributes; drawings keep their colours
  allowed         level info: a literal the configuration documents as an exception
Human judgement (hierarchy, type pairing, brand fit, copy, the imagery itself) and what cannot be verified from code
(perceived quality) are listed in the notes: no tool decides them.
Without a token layer the literals are the system: colours and fonts are reported as heuristic with a note.
`

const COLOR_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab|color)\([^)]*\)/gi
const SIZE_PROPS = ['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me', 'gap', 'gap-x', 'gap-y', 'space-x', 'space-y', 'w', 'h', 'size', 'min-w', 'max-w', 'min-h', 'max-h', 'inset', 'top', 'right', 'bottom', 'left', 'start', 'end', 'text', 'leading', 'rounded', 'rounded-t', 'rounded-b', 'rounded-l', 'rounded-r', 'indent', 'basis']
const SIZE_RE = new RegExp(`(?:^|[\\s"'\`:])(?:[a-z-]+:)*(?:-?)(${SIZE_PROPS.join('|')})-\\[(\\d+(?:\\.\\d+)?)(px|rem)\\]`, 'g')
const ARB_RE = (name) => new RegExp(`(?:^|[\\s"'\`:])(?:[a-z-]+:)*${name}-\\[([^\\]]+)\\]`, 'g')
const CLASS_ATTR_RE = /(?<![:\w-])(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g
const BOUND_CLASS_RE = /:class\s*=\s*"([^"]*)"|className=\{([^}]*)\}/g
const STYLE_ATTR_RE = /style\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\{([^}]*)\}\})/g
const SVG_ATTR_RE = /\b(?:fill|stroke|stop-color|flood-color|lighting-color)\s*=\s*["'{]/
const CSS_DECL_RE = /([a-z-]+)\s*:\s*([^;{}]+)[;}]/g
const COLOR_PROPS = /^(color|background|background-color|border|border-color|border-top|border-right|border-bottom|border-left|outline|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color|box-shadow)$/
const SVG_TAGS = /<(svg|path|rect|circle|ellipse|line|polyline|polygon|g|stop|linearGradient|radialGradient|text|tspan|use|defs|mask|clipPath|filter|feFlood)\b/i
const GENERATED_FILE = /(^|\/)(tokens[^/]*\.css|[^/]*-map\.css|nuxt-ui-map\.css)$/

const classOf = (level, kind = null) => (kind ? kind : level === 'confirmed' ? 'defect' : level === 'heuristic' ? 'heuristic' : 'recommendation')
const lineAt = (text, index) => text.slice(0, index).split('\n').length

/** Is the position inside an <svg> ... </svg> region of the text? */
function svgRanges(text) {
  const ranges = []
  const re = /<svg\b[\s\S]*?<\/svg>/gi
  let m
  while ((m = re.exec(text))) ranges.push([m.index, m.index + m[0].length])
  return ranges
}
const inRanges = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b)

/** The token layer: @theme blocks or --color-* custom properties anywhere in the project's stylesheets. */
function detectTokenLayer(root, files) {
  const hits = []
  for (const f of files) {
    if (!/\.(css|scss)$/.test(f.rel)) continue
    const text = readFileSync(f.abs, 'utf8')
    if (/@theme\b/.test(text) || /--color-[a-z0-9-]+\s*:/.test(text) || /--font-[a-z0-9-]+\s*:/.test(text)) hits.push(f.rel)
  }
  return hits
}

function offGrid(value, unit, baseRem) {
  const rem = unit === 'px' ? value / 16 : value
  const ratio = rem / baseRem
  return Math.abs(ratio - Math.round(ratio)) > 1e-6
}

export function scanText(text, file, { baseRem, allow, svgOnly = false }) {
  const out = []
  const ranges = svgRanges(text)
  const push = (f) => out.push({ file, ...f })
  const colorIn = (value, index, { where }) => {
    for (const c of value.match(COLOR_RE) ?? []) {
      const literal = c.toLowerCase()
      const imagery = svgOnly || inRanges(ranges, index) || SVG_ATTR_RE.test(text.slice(Math.max(0, index - 24), index + 2))
      if (allow.has(literal)) push({ id: 'allowed-literal-color', level: 'info', severity: 'low', class: 'allowed', line: lineAt(text, index), value: literal, where })
      else if (imagery) push({ id: 'imagery-literal-color', level: 'info', severity: 'low', class: 'imagery', line: lineAt(text, index), value: literal, where })
      else push({ id: 'literal-color', level: 'confirmed', severity: 'medium', class: 'defect', line: lineAt(text, index), value: literal, where })
    }
  }
  // 1. class attributes: Tailwind arbitrary values
  for (const re of [CLASS_ATTR_RE, BOUND_CLASS_RE]) {
    let m
    while ((m = re.exec(text))) {
      const body = m.slice(1).find((x) => x !== undefined) ?? ''
      const at = m.index
      colorIn(body.replace(/var\([^)]*\)/g, ''), at, { where: 'class' })
      let s
      SIZE_RE.lastIndex = 0
      while ((s = SIZE_RE.exec(body))) {
        const value = Number(s[2])
        const off = offGrid(value, s[3], baseRem)
        push(off ? { id: 'off-grid-size', level: 'confirmed', severity: 'low', class: 'defect', line: lineAt(text, at), value: `${s[1]}-[${s[2]}${s[3]}]`, where: 'class' } : { id: 'arbitrary-size', level: 'heuristic', severity: 'low', class: 'heuristic', line: lineAt(text, at), value: `${s[1]}-[${s[2]}${s[3]}]`, where: 'class' })
      }
      for (const [name, id, level] of [['font', 'literal-font-family', 'confirmed'], ['shadow', 'literal-shadow', 'heuristic'], ['duration', 'literal-duration', 'heuristic'], ['z', 'z-index-literal', 'heuristic']]) {
        const r = ARB_RE(name)
        let a
        while ((a = r.exec(body))) {
          const v = a[1]
          if (/^(var\(|--|length:|color:)/.test(v)) continue
          if (name === 'z' && Number(v) <= 50) continue
          if (name === 'font' && /^(family-name:)?(var\(|--)/.test(v)) continue
          push({ id, level, severity: 'low', class: classOf(level), line: lineAt(text, at), value: `${name}-[${v}]`, where: 'class' })
        }
      }
    }
  }
  // 2. inline styles
  let st
  while ((st = STYLE_ATTR_RE.exec(text))) {
    const body = st.slice(1).find((x) => x !== undefined) ?? ''
    const at = st.index
    const cleaned = body.replace(/var\([^)]*\)/g, '')
    // a dynamic binding (style={{ background: f.hex }}) carries no literal: only quoted values are read
    const quoted = /^\s*\{/.test(st[0].slice(st[0].indexOf('=') + 1)) ? (cleaned.match(/(["'`])(?:(?!\1).)*\1/g) ?? []).join(' ') : cleaned
    colorIn(quoted, at, { where: 'style' })
    for (const px of quoted.match(/\b(\d+(?:\.\d+)?)px\b/g) ?? []) {
      const v = Number.parseFloat(px)
      if (v === 0 || v === 1) continue
      if (offGrid(v, 'px', baseRem)) push({ id: 'off-grid-size', level: 'confirmed', severity: 'low', class: 'defect', line: lineAt(text, at), value: px, where: 'style' })
    }
    const fam = cleaned.match(/font(?:-f|F)amily\s*:\s*['"]?([^;'"},]+(?:,[^;'"}]+)?)/)
    if (fam && !/var\(/.test(fam[0])) push({ id: 'literal-font-family', level: 'confirmed', severity: 'low', class: 'defect', line: lineAt(text, at), value: fam[1].trim(), where: 'style' })
  }
  // 3. stylesheets: <style> blocks in SFCs, whole .css files
  const blocks = /\.(css|scss)$/.test(file) ? [{ css: text, offset: 0 }] : [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => ({ css: m[1], offset: m.index + m[0].indexOf(m[1]) }))
  for (const { css, offset } of blocks) {
    let d
    CSS_DECL_RE.lastIndex = 0
    while ((d = CSS_DECL_RE.exec(css))) {
      const [, prop, rawValue] = d
      const at = offset + d.index
      const value = rawValue.trim()
      if (prop.startsWith('--')) {
        if (COLOR_RE.test(value)) push({ id: 'local-token-definition', level: 'heuristic', severity: 'low', class: 'heuristic', line: lineAt(text, at), value: `${prop}: ${value.slice(0, 40)}`, where: 'stylesheet' })
        COLOR_RE.lastIndex = 0
        continue
      }
      const noVar = value.replace(/var\([^)]*\)/g, '')
      if (/^(fill|stroke)$/.test(prop)) { for (const c of noVar.match(COLOR_RE) ?? []) push({ id: 'imagery-literal-color', level: 'info', severity: 'low', class: 'imagery', line: lineAt(text, at), value: c.toLowerCase(), where: 'stylesheet' }) }
      else if (COLOR_PROPS.test(prop)) colorIn(noVar, at, { where: 'stylesheet' })
      if (prop === 'font-family' && !/var\(/.test(value)) push({ id: 'literal-font-family', level: 'confirmed', severity: 'low', class: 'defect', line: lineAt(text, at), value: value.slice(0, 60), where: 'stylesheet' })
      if (prop === 'font-size' && /^\d+(?:\.\d+)?px$/.test(value)) push({ id: 'px-font-size', level: 'heuristic', severity: 'low', class: 'heuristic', line: lineAt(text, at), value, where: 'stylesheet' })
      if (prop === 'box-shadow' && !/var\(/.test(value) && value !== 'none') push({ id: 'literal-shadow', level: 'heuristic', severity: 'low', class: 'heuristic', line: lineAt(text, at), value: value.slice(0, 60), where: 'stylesheet' })
      const durations = [...noVar.matchAll(/(\d*\.?\d+)(m?s)\b/g)].map((m) => (m[2] === 'ms' ? Number(m[1]) : Number(m[1]) * 1000))
      // a reduced-motion cut (0.001ms) is a policy, not a duration outside the tokens
      if (/^(transition|transition-duration|animation|animation-duration)$/.test(prop) && durations.some((d) => d > 1)) push({ id: 'literal-duration', level: 'heuristic', severity: 'low', class: 'heuristic', line: lineAt(text, at), value: value.slice(0, 60), where: 'stylesheet' })
      if (prop === 'z-index' && Number(value) > 50) push({ id: 'z-index-literal', level: 'heuristic', severity: 'low', class: 'heuristic', line: lineAt(text, at), value, where: 'stylesheet' })
      for (const px of (/^(margin|padding|gap|width|height|top|left|right|bottom|inset|border-radius)/.test(prop) ? noVar.match(/\b(\d+(?:\.\d+)?)px\b/g) ?? [] : [])) {
        const v = Number.parseFloat(px)
        if (v <= 1) continue
        if (offGrid(v, 'px', baseRem)) push({ id: 'off-grid-size', level: 'confirmed', severity: 'low', class: 'defect', line: lineAt(text, at), value: `${prop}: ${px}`, where: 'stylesheet' })
      }
    }
  }
  return out
}

export function run(argv) {
  const args = parseArgs(argv)
  if (args.help || !args._[0]) return usage(HELP)
  const root = resolve(String(args._[0]))
  if (!existsSync(root)) return fail(`project root not found: ${root}`)
  const config = loadConfig(root, args.config ? String(args.config) : undefined, { exclude: excludeArg(args) })
  const project = detectProject(root, config)
  const report = createReport('design-consistency', project)
  let baseRem = 0.25
  let contractName = null
  if (args.contract) {
    const file = resolve(String(args.contract))
    if (!existsSync(file)) return fail(`contract not found: ${file}`)
    const contract = JSON.parse(readFileSync(file, 'utf8'))
    baseRem = (contract.spacing?.base ?? 4) / 16
    contractName = contract.name ?? basename(file)
  }
  const allow = new Set([...(args.allow ? String(args.allow).split(',') : []), ...(config.designConsistency?.allow ?? [])].map((s) => s.trim().toLowerCase()).filter(Boolean))
  // sourceFiles() walks the script and component extensions; stylesheets are added here with the same exclusions
  const styleFiles = walk(root, { extensions: ['.css', '.scss'] }).map((abs) => ({ abs, rel: rel(root, abs) })).filter((f) => excludedBy(project, f.rel) < 0)
  const tokenLayer = detectTokenLayer(root, styleFiles)
  const files = [...sourceFiles(project).filter((f) => /\.(vue|tsx|jsx)$/.test(f.rel)), ...styleFiles].filter((f) => !GENERATED_FILE.test(f.rel))
  const hasTokens = tokenLayer.length > 0
  const all = []
  for (const f of files) {
    const text = readFileSync(f.abs, 'utf8')
    const found = scanText(text, f.rel, { baseRem, allow })
    for (const x of found) {
      // without a token layer the literals are the system: a colour or a font is something to read, not a defect
      if (!hasTokens && x.class === 'defect' && /literal-color|literal-font-family/.test(x.id)) { x.level = 'heuristic'; x.class = 'heuristic' }
      all.push(x)
    }
  }
  const messages = {
    'literal-color': (x) => `literal colour ${x.value} in ${x.where}: use a role or ramp token`,
    'imagery-literal-color': (x) => `${x.value} inside SVG or an imagery attribute: a drawing's own colour (not a defect)`,
    'allowed-literal-color': (x) => `${x.value} is a documented exception`,
    'off-grid-size': (x) => `${x.value} is off the ${baseRem * 16}px grid: use the scale, or change the contract`,
    'arbitrary-size': (x) => `arbitrary ${x.value} sits on the grid but outside the scale utilities: prefer the scale`,
    'literal-font-family': (x) => `font family "${x.value}" set outside the typography tokens`,
    'literal-shadow': (x) => `shadow "${x.value}" outside the elevation tokens`,
    'literal-duration': (x) => `duration in "${x.value}" outside the motion tokens`,
    'z-index-literal': (x) => `z-index ${x.value}: layers above 50 need a named scale`,
    'local-token-definition': (x) => `a token defined in a component (${x.value}): move it to the contract or document why it is local`,
    'px-font-size': (x) => `font-size ${x.value} in px does not follow the user's text size (WCAG 1.4.4): use rem`,
  }
  for (const x of all) addFinding(report, { id: x.id, level: x.level, severity: x.severity, class: x.class, file: x.file, line: x.line, message: messages[x.id](x), evidence: x.value, where: x.where })
  // recommendations across files
  const distinctColors = new Set(all.filter((x) => x.id === 'literal-color').map((x) => x.value))
  const arbitrary = all.filter((x) => x.id === 'arbitrary-size' || x.id === 'off-grid-size')
  if (distinctColors.size > 6) addFinding(report, { id: 'design-recommendation', level: 'info', severity: 'low', class: 'recommendation', message: `${distinctColors.size} distinct literal colours across the UI: consolidate them into the contract's ramps and roles before adding more`, evidence: [...distinctColors].slice(0, 8).join(', ') })
  if (arbitrary.length > 10) addFinding(report, { id: 'design-recommendation', level: 'info', severity: 'low', class: 'recommendation', message: `${arbitrary.length} arbitrary sizes: extend the spacing or type scale instead of writing values inline` })
  const byClass = {}
  for (const f of report.findings) byClass[f.class] = (byClass[f.class] ?? 0) + 1
  report.summary = { files: files.length, tokenLayer: hasTokens ? tokenLayer.slice(0, 5) : [], contract: contractName, gridPx: baseRem * 16, byClass, distinctLiteralColors: distinctColors.size, allowed: [...allow] }
  report.data = { files: files.map((f) => f.rel) }
  if (!hasTokens) report.notes.push('no token layer found (no @theme block or --color-*/--font-* variables in a stylesheet): literal colours and fonts are reported as heuristic; define the tokens (references/design-contract.md) and run again')
  report.notes.push('human judgement, not reported by this tool: the hierarchy of a screen, the pairing of the type families, whether the colours fit the brand, the copy, and whether the imagery is good; review them on the rendered screens (references/ui-verification.md).')
  report.notes.push('unverifiable from code: perceived quality and taste; the browser checks and this audit bound the defects, they do not grade the design.')
  const sections = [{ title: 'By class', table: { headers: ['class', 'findings'], rows: Object.entries(byClass).map(([k, v]) => [k, v]) } }]
  return finish(report, args, { sections })
}

if (isMainModule(import.meta.url)) process.exitCode = run(process.argv.slice(2))
