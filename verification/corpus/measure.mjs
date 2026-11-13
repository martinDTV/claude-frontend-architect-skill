#!/usr/bin/env node
// measure (1.7 increment 3): the deterministic FP/FN measurer. It runs each auditor against each corpus case and
// classifies every tool finding and every ground-truth item into TP/FP/FN/TN, then reports precision/recall/F1 per area
// and overall, with honest buckets for heuristic-where-confirmed-due, insufficient-evidence and out-of-scope. It runs NO
// agent and NO model. The ground truth is read from ground-truth.json, which is written from the source by hand — never
// derived from the tool — so a divergence is a real result. Usage: node measure.mjs [--json] [--area state]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts')
const vue = join(here, '..', 'vue')
const AREAS = ['arch', 'state', 'routes', 'perf', 'a11y', 'bundle', 'ds']
const DEFECT_LEVELS = new Set(['confirmed', 'heuristic'])

const flagsFor = (tool, engine) => {
  if (tool === 'route-attribution.mjs') return ['--no-perf', '--format', 'json', '--fail-on', 'none']
  if (engine === 'semantic') return ['--engine', 'semantic', '--typescript', vue, '--vue-compiler', vue, '--format', 'json', '--fail-on', 'none']
  if (tool === 'domain-deps.mjs') return ['--engine', 'lexical', '--format', 'json', '--fail-on', 'none']
  return ['--format', 'json', '--fail-on', 'none']
}
const base = (f) => (f == null ? '' : String(f).replace(/^.*\//, ''))
const near = (a, b, tol) => a == null || b == null ? true : Math.abs(a - b) <= tol

function runToolOnCase(caseDir, truth) {
  // Build the case into an isolated temp dir if it has a scaffold.sh; otherwise analyze the dir in place (copied).
  const T = mkdtempSync(join(tmpdir(), 'fa-corpus-'))
  try {
    if (existsSync(join(caseDir, 'scaffold.sh'))) execFileSync('bash', [join(caseDir, 'scaffold.sh')], { cwd: T, stdio: 'ignore' })
    else execFileSync('cp', ['-R', caseDir + '/.', T], { stdio: 'ignore' })
    const flags = flagsFor(truth.tool, truth.engine)
    let out
    try { out = execFileSync('node', [join(scripts, truth.tool), T, ...flags], { cwd: T, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 48 * 1024 * 1024 }) }
    catch (e) { out = e.stdout || '' }
    return JSON.parse(out).findings || []
  } finally { rmSync(T, { recursive: true, force: true }) }
}

export function classifyCase(truth, findings) {
  const tol = truth.line_tolerance ?? 1
  const outOfScope = new Set(truth.out_of_scope || [])
  const defects = findings.filter((f) => DEFECT_LEVELS.has(f.level) && !outOfScope.has(f.id))
  const r = { tp: 0, fp: 0, fn: 0, tn: 0, heuristicPartial: 0, coverageGap: 0, details: [] }

  // known coverage gaps: real defects the tool does not claim to cover (e.g. a custom ARIA widget for ui-audit).
  // Surfaced so a genuine miss is visible, but excluded from recall — it is not an FN of a rule the tool has.
  for (const g of truth.coverage_gaps || []) { r.coverageGap++; r.details.push(`COVERAGE-GAP (real defect, tool out of scope): ${g.id ?? g.what}@${base(g.file)}${g.line != null ? ':' + g.line : ''}`) }

  // match each expected item to a defect-level finding (same id + file + line within tol)
  const usedFinding = new Set()
  for (const e of truth.expected || []) {
    const hit = defects.find((f, i) => !usedFinding.has(i) && f.id === e.id && base(f.file) === base(e.file) && near(f.line, e.line, tol))
    if (hit) {
      usedFinding.add(defects.indexOf(hit))
      r.tp++
      if (e.min_level === 'confirmed' && hit.level === 'heuristic') { r.heuristicPartial++; r.details.push(`heuristic-where-confirmed-due: ${e.id}@${base(e.file)}`) }
    } else {
      r.fn++; r.details.push(`FN(missed): ${e.id}@${base(e.file)}:${e.line}`)
    }
  }
  // forbidden ids reported here are FP; any remaining defect finding on a negative-control or unexpected file is FP
  const forbidden = new Set((truth.forbidden || []).map((x) => `${x.id}@${base(x.file)}`))
  defects.forEach((f, i) => {
    if (usedFinding.has(i)) return
    if (forbidden.has(`${f.id}@${base(f.file)}`) || truth.category === 'negative-control' || !(truth.expected || []).length) {
      r.fp++; r.details.push(`FP(invented): ${f.id}@${base(f.file)}:${f.line}`)
    } else {
      // a defect finding not in expected and not forbidden, on a case that has other expected items: still unexpected -> FP
      r.fp++; r.details.push(`FP(unexpected): ${f.id}@${base(f.file)}:${f.line}`)
    }
  })
  // TN: a genuine clean/negative case with no defect-level finding
  if ((truth.category === 'negative-control' || !(truth.expected || []).length) && defects.length === 0) r.tn++
  return r
}

export function prf(tp, fp, fn) {
  const precision = tp + fp ? tp / (tp + fp) : null
  const recall = tp + fn ? tp / (tp + fn) : null
  const f1 = precision != null && recall != null && (precision + recall) ? (2 * precision * recall) / (precision + recall) : null
  return { precision, recall, f1 }
}
const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`)

function main() {
  const json = process.argv.includes('--json')
  const areaIdx = process.argv.indexOf('--area')
  const onlyArea = areaIdx >= 0 ? process.argv[areaIdx + 1] : null
  // --root <dir> measures a sibling corpus (e.g. the hold-out) instead of the development corpus. Additive measurer
  // flag only; it changes no auditor. Development and hold-out are always measured and reported separately.
  const rootIdx = process.argv.indexOf('--root')
  const rootDir = rootIdx >= 0 ? (process.argv[rootIdx + 1].startsWith('/') ? process.argv[rootIdx + 1] : join(here, '..', '..', process.argv[rootIdx + 1])) : here
  const perArea = {}
  const allDetails = []
  for (const area of AREAS) {
    if (onlyArea && area !== onlyArea) continue
    const areaDir = join(rootDir, area)
    if (!existsSync(areaDir)) continue
    // --set A|B restricts to hold-out subsets by case-name prefix (A* = known-limit, B* = blind generalization),
    // so development, known-limit and generalization results are always reported separately, never merged.
    const setIdx = process.argv.indexOf('--set')
    const onlySet = setIdx >= 0 ? process.argv[setIdx + 1] : null
    const cases = readdirSync(areaDir).filter((d) => statSync(join(areaDir, d)).isDirectory() && (!onlySet || d.startsWith(onlySet))).sort()
    const agg = { tp: 0, fp: 0, fn: 0, tn: 0, heuristicPartial: 0, coverageGap: 0, cases: 0 }
    for (const c of cases) {
      const caseDir = join(areaDir, c)
      const gtPath = join(caseDir, 'ground-truth.json')
      if (!existsSync(gtPath)) continue
      const truth = JSON.parse(readFileSync(gtPath, 'utf8'))
      const findings = runToolOnCase(caseDir, truth)
      const r = classifyCase(truth, findings)
      agg.tp += r.tp; agg.fp += r.fp; agg.fn += r.fn; agg.tn += r.tn; agg.heuristicPartial += r.heuristicPartial; agg.coverageGap += r.coverageGap; agg.cases++
      for (const d of r.details) allDetails.push(`${area}/${c}: ${d}`)
    }
    perArea[area] = { ...agg, ...prf(agg.tp, agg.fp, agg.fn) }
  }
  const totals = Object.values(perArea).reduce((a, x) => ({ tp: a.tp + x.tp, fp: a.fp + x.fp, fn: a.fn + x.fn, tn: a.tn + x.tn, heuristicPartial: a.heuristicPartial + x.heuristicPartial, coverageGap: a.coverageGap + x.coverageGap, cases: a.cases + x.cases }), { tp: 0, fp: 0, fn: 0, tn: 0, heuristicPartial: 0, coverageGap: 0, cases: 0 })
  const overall = { ...totals, ...prf(totals.tp, totals.fp, totals.fn) }

  if (json) { process.stdout.write(JSON.stringify({ perArea, overall, details: allDetails }, null, 2) + '\n'); return }
  console.log('# Adversarial corpus — FP/FN measurement (deterministic, no model)\n')
  console.log('| area | cases | TP | FP | FN | clean-held | heur-partial | cov-gap | precision | recall | F1 |')
  console.log('|------|-------|----|----|----|------------|--------------|---------|-----------|--------|----|')
  for (const [a, x] of Object.entries(perArea)) console.log(`| ${a} | ${x.cases} | ${x.tp} | ${x.fp} | ${x.fn} | ${x.tn} | ${x.heuristicPartial} | ${x.coverageGap} | ${pct(x.precision)} | ${pct(x.recall)} | ${pct(x.f1)} |`)
  console.log(`| **all** | ${overall.cases} | ${overall.tp} | ${overall.fp} | ${overall.fn} | ${overall.tn} | ${overall.heuristicPartial} | ${overall.coverageGap} | ${pct(overall.precision)} | ${pct(overall.recall)} | ${pct(overall.f1)} |`)
  if (allDetails.length) { console.log('\n## Per-case detail (misses, false positives, heuristic partials, coverage gaps)'); for (const d of allDetails) console.log(`- ${d}`) }
  console.log('\n## Units and honesty')
  console.log('- TP/FP/FN are counted PER FINDING (each expected defect / each tool finding); "clean-held" is counted PER CASE (a clean/negative case where the tool raised no defect-level finding). precision = TP/(TP+FP) and recall = TP/(TP+FN) use only the per-finding counts; clean-held never enters them (it is not a confusion-matrix TN and must not be read as one).')
  console.log('- "cov-gap" (known coverage gap) counts real defects the tool does NOT claim to cover (e.g. custom ARIA widgets for ui-audit): declared via coverage_gaps[], surfaced here so a genuine miss is visible, and excluded from recall by construction (it is not an FN of a rule the tool has).')
  console.log('- Truth is written from the source by hand, independent of the tool. Numbers are reported as measured, including deficiencies; no rule was changed to improve them.')
}

// Run only as a CLI, not when imported by the measurer's own tests.
if (process.argv[1] && process.argv[1].endsWith('measure.mjs')) main()
