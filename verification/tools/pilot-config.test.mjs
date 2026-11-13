// pilot-config (1.7 increment 5A): offline validation of the behavioural pilot configuration. It runs run-evals.sh in
// DRY mode (prints the command, invokes NO model) and asserts the pilot is wired safely and reproducibly: eight
// suite:pilot cases exist, the command always carries --max-cost-usd and --no-publish, the scaffold safety gate is
// enforced, and no model is contacted. It never runs an agent. Any real run stays E0B NOT_RUN until authorized.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const evalsDir = join(root, 'plugins', 'frontend-architect', 'evals')
const runEvals = join(root, 'verification', 'evals', 'run-evals.sh')

// A clean env (no inherited provider flags) with a safe personal-provider config and a BUDGET under MAX_TOTAL_USD
// (BUDGET is the ceiling for the whole invocation), so these structural tests exercise the
// assembled command, not the security guards (those are covered by pilot-hardening.test.mjs).
const dry = (env) => execFileSync('bash', [runEvals, 'pilot'], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DRY: '1', ALLOW_SCAFFOLD: '1', BUDGET: '1', MAX_TOTAL_USD: '20', MODEL: 'haiku', RUNS: '1', EVAL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'dryrun-placeholder', ...env } })

test('exactly eight suite:pilot cases: six area positives + two abstentions', () => {
  const cases = readdirSync(evalsDir).filter((d) => /^\d/.test(d) && existsSync(join(evalsDir, d, 'case.yaml')) && /suite:pilot/.test(readFileSync(join(evalsDir, d, 'case.yaml'), 'utf8')))
  assert.equal(cases.length, 8, `expected 8 pilot cases, got ${cases.length}: ${cases.join(', ')}`)
  const abstain = cases.filter((c) => /abstain/.test(c))
  assert.equal(abstain.length, 2, 'exactly two abstention cases')
  for (const area of ['arch', 'state', 'routes', 'perf', 'a11y', 'bundle']) {
    assert.ok(cases.some((c) => c.includes(area)), `pilot covers ${area}`)
  }
})

test('the pilot command always sets a cost ceiling and never publishes', () => {
  const out = dry({})
  assert.match(out, /--max-cost-usd 1/, 'a hard cost ceiling is always passed')
  assert.match(out, /--no-publish/, 'the report is never published to claude.ai')
  assert.match(out, /--tag suite:pilot --scaffold --allow-tools Bash/, 'the pilot selects its tag and grants scaffold+Bash the cases need')
})

test('DRY mode invokes no model (prints the command and exits)', () => {
  const out = dry({})
  assert.match(out, /^command:/m, 'DRY prints the command')
  // it must not contain any evidence of a run having happened (no result json path being written beyond the planned --json arg)
  assert.ok(!/run \d+ of/.test(out), 'no run progress — nothing executed')
})

test('the scaffold safety gate is enforced (no silent scaffold execution)', () => {
  let threw = false
  try { execFileSync('bash', [runEvals, 'pilot'], { cwd: root, encoding: 'utf8', env: { ...process.env, DRY: '1', BUDGET: '5' } }) } // no ALLOW_SCAFFOLD
  catch (e) { threw = true; assert.match(String(e.stdout || e.message), /scaffold\.sh as you|ALLOW_SCAFFOLD/) }
  assert.ok(threw, 'without ALLOW_SCAFFOLD=1 the pilot refuses to run scaffolds')
})

test('every pilot case has a verifiable ground truth and a scaffold or is an abstention', () => {
  const cases = readdirSync(evalsDir).filter((d) => /^\d/.test(d) && existsSync(join(evalsDir, d, 'case.yaml')) && /suite:pilot/.test(readFileSync(join(evalsDir, d, 'case.yaml'), 'utf8')))
  for (const c of cases) {
    assert.ok(existsSync(join(evalsDir, c, 'truth.json')), `${c}: has a ground truth`)
    const isAbstain = /abstain/.test(c)
    assert.equal(existsSync(join(evalsDir, c, 'scaffold.sh')), !isAbstain, `${c}: positives have a scaffold, abstentions do not`)
  }
})

// CASE=<glob> (post-5B): run a single pilot case first to measure real consumption; the budget line names the matching
// case count, and a glob that matches no pilot case must refuse rather than run everything.
test('CASE=<glob> selects one pilot case and the budget line counts only it', () => {
  const out = dry({ CASE: '96-*', MAX_TOTAL_USD: '2' })
  assert.match(out, /--case arch-positive(\s|$)/m, 'the CLI filters by the case name: field, not the directory; the harness translates') // not 96-*
  assert.match(out, /1 case\(s\) x 1 run\(s\) x 2 arms/)
})
test('CASE that matches no suite:pilot case refuses (never silently runs the whole suite)', () => {
  let threw = false
  try { dry({ CASE: '01-*' }) } catch (e) { threw = true; assert.match(String(e.stderr || e.message), /matches no suite:pilot case/) }
  assert.ok(threw)
})
test('without CASE the pilot command carries no --case and names all eight', () => {
  const out = dry({})
  assert.doesNotMatch(out, /--case/)
  assert.match(out, /8 case\(s\) x 1 run\(s\) x 2 arms/)
})

test('CASE matching several pilot cases refuses (CASE selects exactly one)', () => {
  let threw = false
  try { dry({ CASE: '*-positive', MAX_TOTAL_USD: '20' }) } catch (e) { threw = true; assert.match(String(e.stderr || e.message), /matches 6 pilot cases; CASE selects exactly one/) }
  assert.ok(threw)
})
