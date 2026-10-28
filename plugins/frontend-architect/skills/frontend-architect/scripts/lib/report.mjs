// Findings model, output formats and exit codes shared by every audit script.
// Levels: `confirmed` = the pattern is present in the code as stated (an import exists, a literal
// key is written); `heuristic` = lexical signal worth a human look; `info` = inventory.
export const TOOL_VERSION = '1.2.0'

export function parseArgs(argv, { booleans = [] } = {}) {
  const out = { _: [] }
  const bools = new Set(['json', 'md', 'help', 'quiet', 'all', ...booleans])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      out._.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1)
      else {
        const key = a.slice(2)
        if (bools.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) out[key] = true
        else out[key] = argv[++i]
      }
    } else out._.push(a)
  }
  return out
}

/** Engine flags shared by the graph-based tools: --engine lexical|semantic|auto, --typescript, --vue-compiler. */
export const ENGINE_HELP = `
  --engine <mode>      lexical | semantic | auto (default auto: semantic when the project's TypeScript
                       compiler API is loadable, lexical otherwise; semantic fails instead of falling back)
  --typescript <dir>   directory whose node_modules (or itself) provides typescript 5.x/6.x
  --vue-compiler <dir> directory providing vue/compiler-sfc (for .vue files)
  --format <f>         text | json | markdown (same as --json / --md)`

export function engineOptionsFrom(args) {
  const engine = String(args.engine ?? 'auto')
  if (!['lexical', 'semantic', 'auto'].includes(engine)) throw new Error(`--engine must be lexical, semantic or auto (got ${engine})`)
  return { engine, typescript: args.typescript ? String(args.typescript) : undefined, vueCompiler: args['vue-compiler'] ? String(args['vue-compiler']) : undefined }
}

/** Normalizes --format into the json/md flags the formatters use. */
export function applyFormat(args) {
  if (args.format === 'json') args.json = true
  else if (args.format === 'markdown' || args.format === 'md') args.md = true
  else if (args.format && args.format !== 'text') throw new Error(`--format must be text, json or markdown (got ${args.format})`)
  return args
}

export function createReport(tool, project) {
  return {
    tool,
    version: TOOL_VERSION,
    root: project.root,
    framework: project.framework,
    generatedAt: new Date().toISOString(),
    config: project.config?.file ?? null,
    summary: {},
    findings: [],
    notes: [...(project.notes ?? [])],
    data: {},
  }
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const LEVEL_ORDER = { confirmed: 0, heuristic: 1, info: 2 }

export function addFinding(report, finding) {
  const f = { level: 'heuristic', severity: 'medium', ...finding }
  if (!LEVEL_ORDER.hasOwnProperty(f.level)) throw new Error(`bad level ${f.level}`)
  if (!SEVERITY_ORDER.hasOwnProperty(f.severity)) throw new Error(`bad severity ${f.severity}`)
  report.findings.push(f)
  return f
}

export function sortFindings(findings) {
  return [...findings].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || String(a.file).localeCompare(String(b.file)) || (a.line ?? 0) - (b.line ?? 0),
  )
}

/** Plain-text table. */
export function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length)))
  const line = (cells) => cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ').trimEnd()
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n')
}

export function mdTable(headers, rows) {
  const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [`| ${headers.map(esc).join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
}

function location(f) {
  return f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : ''
}

function analysisLine(report) {
  const a = report.analysis
  if (!a) return null
  const parts = [`engine: ${a.engine}${a.requested && a.requested !== a.engine ? ` (requested ${a.requested})` : ''}`]
  if (a.typescript?.version) parts.push(`typescript ${a.typescript.version} (${a.typescript.source})`)
  if (a.vueCompiler?.version) parts.push(`vue/compiler-sfc ${a.vueCompiler.version} (${a.vueCompiler.source})`)
  if (a.engine === 'lexical' && a.reason) parts.push(`reason: ${a.reason}`)
  if (a.fallbacks?.length) parts.push(`${a.fallbacks.length} file(s) fell back to lexical parsing`)
  return parts.join(' · ')
}

export function formatText(report, { sections = [] } = {}) {
  const out = []
  out.push(`${report.tool} (frontend-architect tools ${report.version}) — ${report.framework} project at ${report.root}`)
  if (report.config) out.push(`config: ${report.config}`)
  const al = analysisLine(report)
  if (al) out.push(al)
  for (const [k, v] of Object.entries(report.summary)) out.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  for (const s of sections) {
    out.push('', `## ${s.title}`)
    if (s.text) out.push(s.text)
    if (s.table) out.push(table(s.table.headers, s.table.rows))
  }
  const sorted = sortFindings(report.findings)
  for (const level of ['confirmed', 'heuristic', 'info']) {
    const group = sorted.filter((f) => f.level === level)
    if (!group.length) continue
    out.push('', `## ${level.toUpperCase()} (${group.length})`)
    for (const f of group) {
      out.push(`- [${f.severity}] ${f.id}: ${f.message}${location(f) ? `  (${location(f)})` : ''}`)
      if (f.evidence) out.push(`    evidence: ${String(f.evidence).replace(/\n/g, ' ').slice(0, 300)}`)
      if (f.fix) out.push(`    fix: ${f.fix}`)
    }
  }
  if (report.notes.length) {
    out.push('', '## Notes')
    for (const n of report.notes) out.push(`- ${n}`)
  }
  return out.join('\n')
}

export function formatMarkdown(report, { sections = [] } = {}) {
  const out = [`# ${report.tool}`, '', `Project: \`${report.root}\` (${report.framework}). Generated ${report.generatedAt}.`]
  if (report.config) out.push(`Config: \`${report.config}\`.`)
  const al = analysisLine(report)
  if (al) out.push(`Analysis: ${al}.`)
  if (Object.keys(report.summary).length) {
    out.push('', '## Summary', '', mdTable(['Metric', 'Value'], Object.entries(report.summary).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v])))
  }
  for (const s of sections) {
    out.push('', `## ${s.title}`, '')
    if (s.text) out.push(s.text, '')
    if (s.table) out.push(mdTable(s.table.headers, s.table.rows))
  }
  const sorted = sortFindings(report.findings)
  if (sorted.length) {
    out.push('', '## Findings', '', 'Levels: **confirmed** = pattern present as stated; **heuristic** = lexical signal, verify by reading the code.', '')
    out.push(mdTable(['Level', 'Severity', 'Id', 'Location', 'Finding', 'Fix'], sorted.map((f) => [f.level, f.severity, f.id, location(f), f.message, f.fix ?? ''])))
  }
  if (report.notes.length) out.push('', '## Notes', '', ...report.notes.map((n) => `- ${n}`))
  return out.join('\n')
}

/**
 * Prints the report in the requested format and returns the exit code:
 * 0 = nothing to fail on; 1 = findings matched `--fail-on` (default: confirmed); 2 = tool error.
 */
export function finish(report, args, options = {}) {
  applyFormat(args)
  const failOn = args['fail-on'] ?? 'confirmed'
  const output = args.json ? JSON.stringify(report, null, 2) : args.md ? formatMarkdown(report, options) : formatText(report, options)
  if (!args.quiet) process.stdout.write(`${output}\n`)
  if (failOn === 'none') return 0
  if (failOn === 'any') return report.findings.length ? 1 : 0
  return report.findings.some((f) => f.level === 'confirmed') ? 1 : 0
}

export function fail(message) {
  process.stderr.write(`error: ${message}\n`)
  return 2
}

export function usage(text) {
  process.stdout.write(`${text.trim()}\n`)
  return 0
}
