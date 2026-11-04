#!/usr/bin/env node
// validate-contracts (1.7 increment 4): a deterministic, model-free validator of the implementation-quality scenario
// contracts. It checks that each scenario.json is well formed and ENFORCES the axis-independence and
// no-visual-autopass rules structurally — it does NOT run any app (the reference apps are driven by their existing
// check-*.mjs in the gate). It also confirms each scenario names a reference app, an existing driver check, and a
// negative control. Usage: node validate-contracts.mjs [--json]
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scenariosDir = join(here, 'scenarios')
const repoRoot = join(here, '..', '..')
const AXES = ['functional', 'accessibility', 'performance', 'visual']

function validate(scenario, id) {
  const errs = []
  const req = ['id', 'brief', 'reference_app', 'driver', 'required_features', 'architecture_constraints', 'axes', 'negative_control', 'human_review']
  for (const k of req) if (!(k in scenario)) errs.push(`missing "${k}"`)
  if (scenario.id !== id) errs.push(`id "${scenario.id}" != filename "${id}"`)
  if ((scenario.brief || '').length < 40) errs.push('brief too short')
  if (!Array.isArray(scenario.required_features) || scenario.required_features.length < 2) errs.push('required_features must list >=2 verifiable features')

  // the driver must be an existing check script (we reuse, never re-implement)
  if (scenario.driver) {
    const found = ['next', 'nuxt'].some((p) => existsSync(join(repoRoot, 'verification', p, scenario.driver)))
    if (!found) errs.push(`driver ${scenario.driver} not found under verification/{next,nuxt} (contracts reuse existing checks)`)
  }

  // all four axes present, each with a tier and accept/reject (or the visual split)
  for (const ax of AXES) {
    const a = scenario.axes?.[ax]
    if (!a) { errs.push(`axis ${ax} missing`); continue }
    if (!a.tier) errs.push(`axis ${ax} has no tier`)
    if (ax === 'visual') {
      // the visual axis MUST split an E0A mechanical part from an E2 human part, and must NOT claim an automated pass
      if (!/E2/.test(a.tier)) errs.push('visual axis must include an E2 (human) tier')
      if (!a.e2 || !/HUMAN_REVIEW_REQUIRED/.test(a.e2)) errs.push('visual axis must mark its judgement HUMAN_REVIEW_REQUIRED')
      const blob = JSON.stringify(a).toLowerCase()
      if (/axe|lighthouse|snapshot/.test(blob) && !/never|not a|no automated/.test(blob)) errs.push('visual axis must not imply a pass from axe/Lighthouse/snapshot')
    } else {
      if (!a.accept || !a.reject) errs.push(`axis ${ax} needs explicit accept and reject conditions`)
    }
  }

  // functional axis must state that "does not compile" is a hard fail (axis independence: no rescue by other axes)
  const fn = JSON.stringify(scenario.axes?.functional || {}).toLowerCase()
  if (!/compile|build|tsc/.test(fn)) errs.push('functional axis must key on compile/build')

  // negative control must be referenced (a known-defect variant that must FAIL a named axis)
  if (scenario.negative_control && !/negatives\//.test(scenario.negative_control)) errs.push('negative_control must point under negatives/')

  // human review must carry a rubric (the E2 judgement is explicit, not implied)
  if (!Array.isArray(scenario.human_review?.rubric) || scenario.human_review.rubric.length < 2) errs.push('human_review needs a rubric of >=2 questions')
  return errs
}

function main() {
  const files = existsSync(scenariosDir) ? readdirSync(scenariosDir).filter((f) => f.endsWith('.json')).sort() : []
  const results = files.map((f) => ({ id: f.replace(/\.json$/, ''), errors: validate(JSON.parse(readFileSync(join(scenariosDir, f), 'utf8')), f.replace(/\.json$/, '')) }))
  const json = process.argv.includes('--json')
  if (json) { process.stdout.write(JSON.stringify({ scenarios: results.length, results }, null, 2) + '\n'); return }
  console.log(`# Implementation-quality contracts: ${results.length} scenarios\n`)
  let bad = 0
  for (const r of results) {
    if (r.errors.length) { bad++; console.log(`FAIL ${r.id}:`); for (const e of r.errors) console.log(`  - ${e}`) }
    else console.log(`ok   ${r.id} (4 axes, E0/E2 split, driver + negative control + rubric)`)
  }
  console.log(`\n${bad ? `${bad} invalid` : 'all contracts valid'}; each reuses an existing check driver, keeps the four axes independent, and never lets an automated signal pass the visual axis.`)
  process.exit(bad ? 1 : 0)
}

// Aggregate four per-axis states into a scenario verdict. Axis independence: the scenario is the WORST axis, and a
// non-existent artifact is NOT_RUN, never a pass. The visual axis contributes its E0A mechanical state to PASS/FAIL but
// its judgement caps the scenario at HUMAN_REVIEW_REQUIRED — an automated signal never produces a visual PASS. The rules
// this encodes (tested adversarially): does-not-compile => functional FAIL regardless of other axes; a clean axe does
// not pass the visual judgement; a missing artifact is NOT_RUN; over-engineering is not rewarded (it surfaces as a
// functional/architecture signal, never a bonus).
const RANK = { INVALID_CONFIGURATION: 0, NOT_RUN: 1, INSUFFICIENT_EVIDENCE: 2, FAIL: 3, HUMAN_REVIEW_REQUIRED: 4, PASS: 5 }
export function scenarioVerdict(axes) {
  // axes: { functional, accessibility, performance, visual } each a state string; visual may be { e0a, e2 }
  const states = []
  for (const [name, v] of Object.entries(axes)) {
    if (name === 'visual' && v && typeof v === 'object') {
      states.push(v.e0a ?? 'INSUFFICIENT_EVIDENCE')
      // the human judgement is always HUMAN_REVIEW_REQUIRED until a person records a verdict; it can only lower, never raise
      states.push(v.e2 ?? 'HUMAN_REVIEW_REQUIRED')
    } else states.push(v)
  }
  if (states.includes('INVALID_CONFIGURATION')) return 'INVALID_CONFIGURATION'
  if (states.includes('NOT_RUN')) return 'NOT_RUN'
  if (states.includes('INSUFFICIENT_EVIDENCE')) return 'INSUFFICIENT_EVIDENCE'
  if (states.includes('FAIL')) return 'FAIL'
  if (states.includes('HUMAN_REVIEW_REQUIRED')) return 'HUMAN_REVIEW_REQUIRED'
  return 'PASS'
}

export { validate }
if (process.argv[1] && process.argv[1].endsWith('validate-contracts.mjs')) main()
