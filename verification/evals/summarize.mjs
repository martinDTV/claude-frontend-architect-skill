#!/usr/bin/env node
// Summarizes a `claude plugin eval` results directory (result.json from --json, or aggregate-result.json)
// without assuming its exact schema: finds the case list, per-arm scores, grader outcomes, activation
// indicators and any cost figures. Prints a Markdown table. Usage: summarize.mjs <results-dir-or-json>
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('usage: summarize.mjs <results-dir-or-json>')
  process.exit(2)
}
function findJson(path) {
  if (statSync(path).isFile()) return path
  for (const name of ['result.json', 'aggregate-result.json']) if (existsSync(join(path, name))) return join(path, name)
  const stack = [path]
  while (stack.length) {
    const dir = stack.pop()
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (/aggregate-result\.json$|result\.json$/.test(e.name)) return full
    }
  }
  return null
}
const file = findJson(target)
if (!file) {
  console.error(`no result.json or aggregate-result.json under ${target}`)
  process.exit(2)
}
const data = JSON.parse(readFileSync(file, 'utf8'))

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
function findCases(node, depth = 0) {
  if (depth > 6 || !node) return null
  if (Array.isArray(node) && node.length && node.every((c) => isObj(c) && ('name' in c || 'case' in c || 'caseName' in c || 'id' in c))) return node
  if (isObj(node)) {
    for (const key of ['cases', 'results', 'caseResults', 'items']) if (node[key]) { const r = findCases(node[key], depth + 1); if (r) return r }
    for (const v of Object.values(node)) { const r = findCases(v, depth + 1); if (r) return r }
  }
  return null
}
function numbers(node, pattern, acc = [], depth = 0, path = '') {
  if (depth > 8 || !node) return acc
  if (isObj(node)) for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'number' && pattern.test(k)) acc.push({ path: `${path}.${k}`, value: v })
    else numbers(v, pattern, acc, depth + 1, `${path}.${k}`)
  }
  else if (Array.isArray(node)) node.forEach((v, i) => numbers(v, pattern, acc, depth + 1, `${path}[${i}]`))
  return acc
}
function graders(node, acc = [], depth = 0) {
  if (depth > 8 || !node) return acc
  if (Array.isArray(node)) node.forEach((v) => graders(v, acc, depth + 1))
  else if (isObj(node)) {
    const name = node.grader ?? node.graderName ?? node.name
    const hasVerdict = ['passed', 'pass', 'ok', 'score', 'verdict'].some((k) => k in node)
    if (name && hasVerdict && (node.type || /grader|criteria|skill|activation|regex|tool/i.test(String(name)))) {
      const passed = node.passed ?? node.pass ?? node.ok ?? (typeof node.score === 'number' ? node.score >= 1 : node.verdict === 'PASS')
      acc.push({ name: String(name), passed, arm: node.arm ?? node.armName ?? null })
    }
    for (const v of Object.values(node)) graders(v, acc, depth + 1)
  }
  return acc
}
const cases = findCases(data) ?? []
console.log(`file: ${file}`)
console.log(`cases found: ${cases.length}`)
const rows = []
for (const c of cases) {
  const name = c.name ?? c.caseName ?? c.case ?? c.id
  const scores = numbers(c, /^(score|meanScore|averageScore|mean|avg|withScore|withoutScore|baselineScore|delta)$/i)
  const byArm = {}
  for (const s of scores) {
    const arm = /without|baseline/i.test(s.path) ? 'without' : /with\b|plugin/i.test(s.path) ? 'with' : 'score'
    byArm[arm] = byArm[arm] ?? s.value
  }
  const gs = graders(c)
  const activation = gs.filter((g) => /skill-activation|no-frontend-skill|skill-used/.test(g.name))
  const failed = gs.filter((g) => g.passed === false && !activation.includes(g)).map((g) => g.name)
  const cost = numbers(c, /cost/i).reduce((n, x) => n + x.value, 0)
  // per-run turns and errors: a zero score with an error is a run that never produced an answer
  const runs = []
  const walkRuns = (node, depth = 0) => {
    if (depth > 6 || !node) return
    if (Array.isArray(node)) return node.forEach((v) => walkRuns(v, depth + 1))
    if (isObj(node)) {
      if ('turns' in node && ('score' in node || 'error' in node)) runs.push(node)
      else for (const v of Object.values(node)) walkRuns(v, depth + 1)
    }
  }
  walkRuns(c.arms ?? c.runs ?? c)
  const turns = runs.map((r) => r.turns).join('/')
  const errors = [...new Set(runs.filter((r) => r.error).map((r) => String(r.error).replace(/^exit \d+: /, '').slice(0, 70)))]
  rows.push([name, byArm.with ?? byArm.score ?? '', byArm.without ?? '', activation.map((g) => `${g.name.replace(/\.md$/, '')}=${g.passed === undefined ? '?' : g.passed ? 'yes' : 'no'}`).join(' ') || '-', failed.join(', ') || '-', turns || '-', errors.length ? `${errors.length} run(s): ${errors[0]}` : '-', cost ? cost.toFixed(3) : ''])
}
if (rows.length) {
  console.log('\n| case | with | without | activation | failed graders | turns | errors | cost usd |\n|---|---|---|---|---|---|---|---|')
  for (const r of rows) console.log(`| ${r.join(' | ')} |`)
}
const totals = numbers(data, /cost|usd/i).filter((n) => !/\[\d+\]/.test(n.path))
if (totals.length) {
  console.log('\ntop-level cost fields:')
  for (const t of totals.slice(0, 10)) console.log(`  ${t.path} = ${t.value}`)
}
if (!rows.length) {
  console.log('\ncould not locate a case list; top-level keys:', Object.keys(data).join(', '))
}
