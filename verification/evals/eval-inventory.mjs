#!/usr/bin/env node
// eval-inventory (1.7 increment 1): a deterministic, model-free inventory of the evaluation suite. It reads every case
// under plugins/frontend-architect/evals/, classifies it by functional area, evidence tier (E0A/E0B/E1/E2, see
// docs/evaluation-contracts.md), the graders it carries, whether it needs a model to run, whether it drives the audit
// tools, whether a ground truth exists, and its real execution state. It computes nothing about behaviour and runs no
// agent; it only describes what is on disk. `--json` emits the machine form, default prints a Markdown table.
//
// Evidence tier is DERIVED, never asserted favourably:
//   - a case whose only graders are tool_used/regex AND whose prompt grants Bash and a scaffold/tool run exists -> E0B
//     (needs a real agent run to produce the transcript those graders parse). Its state is NOT_RUN until a run exists.
//   - a case with an llm grader -> E1 (needs a judge model). State NOT_RUN unless a scored result is recorded.
//   - structural-only facts about the case (well-formedness) are E0A and can be checked now.
//   - visual/aesthetic judgement is E2 (HUMAN_REVIEW_REQUIRED); no case grades it automatically today.
// A case never reports PASS here: this tool inventories evidence requirements and the recorded state, it does not grade.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const EVALS = join(here, '..', '..', 'plugins', 'frontend-architect', 'evals')
const RESULTS = join(EVALS, 'results')

const read = (p) => readFileSync(p, 'utf8')
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!m) return {}
  const out = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line)
    if (kv) out[kv[1]] = kv[2].trim()
  }
  return out
}
const graderType = (text) => frontmatter(text).type ?? null

// Cases 85-88 and 89-95 are provider-gated and explicitly NOT_RUN; this is a documented fact, not a computed score.
const NOT_RUN_RANGES = [[85, 88], [89, 95]]
const caseNumber = (name) => { const m = /^(\d+)/.exec(name); return m ? Number(m[1]) : null }
const isDocumentedNotRun = (name) => { const n = caseNumber(name); return n != null && NOT_RUN_RANGES.some(([a, b]) => n >= a && n <= b) }

function classify(dir, name) {
  const promptPath = join(dir, 'prompt.md')
  const caseYamlPath = join(dir, 'case.yaml')
  const hasPrompt = existsSync(promptPath)
  const hasCaseYaml = existsSync(caseYamlPath)
  let allowedTools = [], tags = []
  const rawText = hasPrompt ? read(promptPath) : (hasCaseYaml ? read(caseYamlPath) : '')
  const atMatch = /allowed_tools:\s*\[([^\]]*)\]/.exec(rawText)
  if (atMatch) allowedTools = atMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
  const tgMatch = /tags:\s*\[([^\]]*)\]/.exec(rawText)
  if (tgMatch) tags = tgMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  const gradersDir = join(dir, 'graders')
  const graderFiles = existsSync(gradersDir) ? readdirSync(gradersDir).filter((f) => f.endsWith('.md')) : []
  const graderTypes = graderFiles.map((g) => graderType(read(join(gradersDir, g))))
  // case.yaml inlines graders; detect their types lexically from the yaml
  if (hasCaseYaml) { const y = read(caseYamlPath); for (const m of y.matchAll(/type:\s*(llm|tool_used|regex|tool_order|file_exists|baseline)/g)) graderTypes.push(m[1]) }

  const hasLlm = graderTypes.includes('llm')
  const hasDeterministicGrader = graderTypes.some((t) => ['tool_used', 'regex', 'tool_order'].includes(t))
  const usesBash = allowedTools.includes('Bash')
  const hasScaffold = hasCaseYaml && /scaffold_script:/.test(read(caseYamlPath))

  // Evidence tier derivation (the highest tier the case's criteria require):
  //   llm grader -> E1; else needs a real agent run (any grader does) -> E0B. Pure structural well-formedness is E0A
  //   and is covered by plugin-check, not by a case verdict. No case grades E2 automatically today.
  const tier = hasLlm ? 'E1' : 'E0B'
  const area = tags.filter((t) => t.startsWith('domain:')).map((t) => t.replace('domain:', '')) || []
  const activation = tags.find((t) => t.startsWith('activation:'))?.replace('activation:', '') ?? 'architect'
  const sayNo = tags.includes('say-no')

  // Ground truth available for this case? tool-running cases may point at a scaffold or a fixture with expected-*.
  const groundTruth = hasScaffold ? 'scaffold (planted defects)' : (hasPrompt && /expected|ground.truth/i.test(read(promptPath)) ? 'referenced' : 'none')

  // Recorded execution state (deterministic facts only):
  //   - documented provider-gated ranges -> NOT_RUN
  //   - otherwise: whether any recorded result exists under results/ for this case (behavioural) -> else NOT_RUN
  const resultsForCase = existsSync(RESULTS) ? readdirSync(RESULTS).filter((d) => {
    const p = join(RESULTS, d)
    return statSync(p).isDirectory() && existsSync(join(p, name))
  }) : []
  let state
  if (isDocumentedNotRun(name)) state = 'NOT_RUN'
  else if (resultsForCase.length === 0) state = 'NOT_RUN'
  else state = 'HAS_RECORDED_RESULT' // not a PASS; a recording exists, grade it with summarize/--regrade

  // A case may be tier E1 (it carries an llm judge) yet ALSO carry deterministic graders that are E0B-verifiable from
  // the transcript alone, without the judge. Expose that so the gradual-evaluation plan can run the free part first.
  const hasE0bComponent = hasDeterministicGrader
  return {
    case: name, shape: hasCaseYaml ? 'case.yaml' : 'prompt.md', area, activation, sayNo,
    tier, hasE0bComponent, graders: graderTypes, deterministicGrader: hasDeterministicGrader, llmGrader: hasLlm,
    usesBash, hasScaffold, needsModelToRun: true, groundTruth, state,
    documentedNotRun: isDocumentedNotRun(name),
  }
}

function main() {
  const cases = readdirSync(EVALS).filter((d) => !['results', 'mocks'].includes(d) && /^\d/.test(d) && statSync(join(EVALS, d)).isDirectory()).sort()
  const rows = cases.map((c) => classify(join(EVALS, c), c))
  const json = process.argv.includes('--json')
  if (json) { process.stdout.write(JSON.stringify({ total: rows.length, cases: rows }, null, 2) + '\n'); return }

  const by = (k, v) => rows.filter((r) => (Array.isArray(r[k]) ? r[k].includes(v) : r[k] === v)).length
  console.log(`# Evaluation inventory (${rows.length} cases) — deterministic, model-free\n`)
  console.log('Evidence tiers per docs/evaluation-contracts.md. No case is PASS here; this is an inventory of what each case needs and its recorded state.\n')
  console.log('| # | case | shape | area | activation | tier | graders | Bash | scaffold | state |')
  console.log('|---|------|-------|------|-----------|------|---------|------|----------|-------|')
  rows.forEach((r, i) => console.log(`| ${i + 1} | ${r.case} | ${r.shape} | ${r.area.join('/') || '-'} | ${r.activation} | ${r.tier} | ${r.graders.join(',') || '-'} | ${r.usesBash ? 'yes' : '-'} | ${r.hasScaffold ? 'yes' : '-'} | ${r.state} |`))
  console.log('\n## Summary')
  console.log(`- shape: ${by('shape', 'case.yaml')} case.yaml, ${by('shape', 'prompt.md')} prompt.md`)
  console.log(`- tier: ${by('tier', 'E0B')} E0B (deterministic grader only, needs a run), ${by('tier', 'E1')} E1 (carries a judge model)`)
  console.log(`- E1 cases that ALSO carry an E0B-verifiable component (tool_used/regex, checkable from the transcript without the judge): ${rows.filter((r) => r.tier === 'E1' && r.hasE0bComponent).length}`)
  console.log(`- tool-running (Bash granted): ${rows.filter((r) => r.usesBash).length}; scaffold (planted defects): ${rows.filter((r) => r.hasScaffold).length}`)
  console.log(`- say-no cases: ${rows.filter((r) => r.sayNo).length}`)
  console.log(`- state: ${by('state', 'NOT_RUN')} NOT_RUN, ${by('state', 'HAS_RECORDED_RESULT')} with a recorded result`)
  console.log(`- documented provider-gated NOT_RUN (85-88, 89-95): ${rows.filter((r) => r.documentedNotRun).length}`)
  console.log('\nEvery case needs a model to run its agent; no behavioural PASS is asserted by this inventory.')
}

main()
