#!/usr/bin/env node
// Validates this repository's plugin distribution: manifests in sync, skill frontmatter and size
// budgets, every reference linked and existing, cross-references resolvable, scripts present and
// executable, eval cases well formed, @verify markers consistent, changelog entry for the version.
// Complements `claude plugin validate`, which does not look inside evals or references.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = join(root, 'plugins', 'frontend-architect')
const failures = []
const warnings = []
const ok = []
const fail = (m) => failures.push(m)
const warn = (m) => warnings.push(m)
const pass = (m) => ok.push(m)
const read = (p) => readFileSync(p, 'utf8')
const rel = (p) => relative(root, p)

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) return null
  const out = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line)
    if (kv) out[kv[1]] = kv[2].trim()
  }
  return out
}

// 1. Manifests
const marketplace = JSON.parse(read(join(root, '.claude-plugin', 'marketplace.json')))
const plugin = JSON.parse(read(join(pluginDir, '.claude-plugin', 'plugin.json')))
const versions = new Set([marketplace.metadata?.version, marketplace.plugins?.[0]?.version, plugin.version])
if (versions.size !== 1 || versions.has(undefined)) fail(`manifest versions differ: ${[...versions].join(', ')}`)
else pass(`manifests agree on version ${plugin.version}`)
if (plugin.name !== 'frontend-architect' || marketplace.plugins?.[0]?.name !== 'frontend-architect') fail('plugin name must stay frontend-architect')
if (!existsSync(join(root, '.claude-plugin', '..', marketplace.plugins[0].source))) fail(`marketplace source missing: ${marketplace.plugins[0].source}`)
const changelog = read(join(root, 'CHANGELOG.md'))
if (!changelog.includes(`## [${plugin.version}]`)) fail(`CHANGELOG.md has no entry for ${plugin.version}`)
else pass(`CHANGELOG has ${plugin.version}`)

// 2. Skills
const skillsDir = join(pluginDir, 'skills')
const skillNames = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory())
for (const name of ['frontend-architect', 'creative-frontend']) if (!skillNames.includes(name)) fail(`public skill ${name} is missing`)
const verifyMarkers = new Map()
for (const name of skillNames) {
  const dir = join(skillsDir, name)
  const skillFile = join(dir, 'SKILL.md')
  if (!existsSync(skillFile)) {
    fail(`${name}: SKILL.md missing`)
    continue
  }
  const text = read(skillFile)
  const fm = frontmatter(text)
  if (!fm) fail(`${name}: SKILL.md has no frontmatter`)
  else {
    if (fm.name !== name) fail(`${name}: frontmatter name "${fm.name}" differs from directory`)
    if (!fm.description) fail(`${name}: description missing`)
    else if (fm.description.length > 1024) warn(`${name}: description is ${fm.description.length} chars (spec recommends <= 1024)`)
  }
  const lines = text.split('\n').length
  if (lines > 500) fail(`${name}: SKILL.md has ${lines} lines (max 500)`)
  else pass(`${name}: SKILL.md ${lines} lines, ~${Math.round(text.length / 4)} tokens`)

  // references linked both ways
  const refDir = join(dir, 'references')
  const refs = existsSync(refDir) ? readdirSync(refDir).filter((f) => f.endsWith('.md')) : []
  const linked = new Set([...text.matchAll(/references\/([a-z0-9-]+\.md)/g)].map((m) => m[1]))
  for (const l of linked) if (!refs.includes(l)) fail(`${name}: SKILL.md links references/${l} which does not exist`)
  for (const r of refs) if (!linked.has(r)) fail(`${name}: references/${r} is not linked from SKILL.md`)
  if (refs.length) pass(`${name}: ${refs.length} references, all linked`)
  // cross references inside references: `x.md` must exist in this skill (or be qualified with a path)
  const allRefNames = new Set(skillNames.flatMap((s) => (existsSync(join(skillsDir, s, 'references')) ? readdirSync(join(skillsDir, s, 'references')) : [])))
  for (const r of refs) {
    const body = read(join(refDir, r))
    for (const m of body.matchAll(/`([a-z0-9-]+\.md)`/g)) {
      if (refs.includes(m[1])) continue
      if (allRefNames.has(m[1])) continue
      if (/^(?:README|CHANGELOG|CONTRIBUTING|CLAUDE|AGENTS|DESIGN|SKILL)\.md$/i.test(m[1])) continue
      fail(`${name}/references/${r} mentions \`${m[1]}\` which is not a reference file`)
    }
    for (const m of body.matchAll(/^```[a-z]*\n((?:\/\/|<!--)\s*@verify\s+([a-z,]+):(\S+?)\s*(?:-->)?)\n([\s\S]*?)```/gm)) {
      const projects = m[2].split(',')
      for (const p of projects) {
        if (!['vue', 'react', 'next', 'nuxt', 'creative'].includes(p)) fail(`${name}/references/${r}: unknown @verify project "${p}"`)
        const key = `${p}:${m[3]}`
        const body2 = m[4]
        if (verifyMarkers.has(key) && verifyMarkers.get(key) !== body2) fail(`@verify ${key} is defined twice with different content (${r})`)
        verifyMarkers.set(key, body2)
      }
    }
    if (body.split('\n').length > 100 && !/^## Contents/m.test(body)) warn(`${name}/references/${r}: longer than 100 lines without a Contents section`)
  }
  // scripts and assets mentioned in SKILL.md must exist; scripts must be executable
  for (const m of text.matchAll(/(?:\$\{CLAUDE_SKILL_DIR\}\/)?(scripts\/[\w./-]+\.mjs|assets\/[\w./-]+)/g)) {
    const p = join(dir, m[1])
    if (!existsSync(p)) fail(`${name}: SKILL.md mentions ${m[1]} which does not exist`)
    else if (m[1].startsWith('scripts/') && !(statSync(p).mode & 0o111)) fail(`${name}: ${m[1]} is not executable`)
  }
  const scriptsDir = join(dir, 'scripts')
  if (existsSync(scriptsDir)) {
    const scripts = readdirSync(scriptsDir).filter((f) => f.endsWith('.mjs'))
    for (const s of scripts) if (!text.includes(s)) fail(`${name}: scripts/${s} is not documented in SKILL.md`)
    pass(`${name}: ${scripts.length} scripts documented`)
  }
}
pass(`${verifyMarkers.size} @verify targets across references`)

// 3. Agents
const agentsDir = join(pluginDir, 'agents')
for (const f of readdirSync(agentsDir)) {
  const fm = frontmatter(read(join(agentsDir, f)))
  if (!fm?.name || !fm?.description) fail(`agent ${f}: name/description missing`)
  else pass(`agent ${fm.name} ok`)
}

// 4. Evals
const evalsDir = join(pluginDir, 'evals')
const cases = readdirSync(evalsDir).filter((d) => !['results', 'mocks'].includes(d) && statSync(join(evalsDir, d)).isDirectory())
const GRADERS = new Set(['llm', 'regex', 'tool_used', 'tool_order', 'file_exists', 'baseline'])
let evalErrors = 0
for (const c of cases) {
  const dir = join(evalsDir, c)
  const prompt = join(dir, 'prompt.md')
  const caseYaml = join(dir, 'case.yaml')
  if (!existsSync(prompt) && !existsSync(caseYaml)) {
    fail(`eval ${c}: neither prompt.md nor case.yaml`)
    evalErrors++
    continue
  }
  if (existsSync(prompt)) {
    const fm = frontmatter(read(prompt))
    if (!fm) fail(`eval ${c}: prompt.md without frontmatter`)
    else if (fm.max_turns && !/^\d+$/.test(fm.max_turns)) fail(`eval ${c}: max_turns must be an integer`)
    const body = read(prompt).replace(/^---\n[\s\S]*?\n---/, '').trim()
    if (body.length < 40) fail(`eval ${c}: prompt body too short`)
  }
  if (existsSync(caseYaml)) {
    const y = read(caseYaml)
    if (!/schema_version:\s*["']?1\.1/.test(y)) fail(`eval ${c}: case.yaml needs schema_version "1.1"`)
    const scaffold = /scaffold_script:\s*(\S+)/.exec(y)?.[1]
    if (scaffold && !existsSync(join(dir, scaffold.replace(/^["']|["']$/g, '')))) fail(`eval ${c}: scaffold_script ${scaffold} missing`)
  }
  const gradersDir = join(dir, 'graders')
  const graders = existsSync(gradersDir) ? readdirSync(gradersDir).filter((f) => f.endsWith('.md')) : []
  if (!graders.length && !existsSync(caseYaml)) fail(`eval ${c}: no graders`)
  for (const g of graders) {
    const text = read(join(gradersDir, g))
    const fm = frontmatter(text)
    if (!fm?.type || !GRADERS.has(fm.type)) {
      fail(`eval ${c}/graders/${g}: unknown or missing grader type "${fm?.type}"`)
      evalErrors++
    }
    if (fm?.type === 'llm' && text.replace(/^---\n[\s\S]*?\n---/, '').trim().length < 40) fail(`eval ${c}/graders/${g}: llm criteria too short`)
    if (fm?.type === 'regex' && !fm.pattern) fail(`eval ${c}/graders/${g}: regex grader without pattern`)
    if (fm?.type === 'tool_used' && !fm.tool) fail(`eval ${c}/graders/${g}: tool_used grader without tool`)
  }
}
pass(`${cases.length} eval cases checked${evalErrors ? ` (${evalErrors} errors)` : ''}`)

// 5. Report
for (const m of ok) console.log(`ok    ${m}`)
for (const m of warnings) console.log(`warn  ${m}`)
for (const m of failures) console.log(`FAIL  ${m}`)
console.log(`\n${failures.length ? `${failures.length} failure(s)` : 'plugin-check passed'} (${warnings.length} warning(s))`)
process.exit(failures.length ? 1 : 0)
