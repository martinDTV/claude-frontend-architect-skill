// pilot hardening (1.7 increment 5A.1): adversarial tests of the eval-harness security controls. All run the harness in
// DRY mode (prints the command, invokes NO model, spends NO tokens) and assert the controls REFUSE unsafe configurations
// and only assemble a command for a safe one. They encode, and prove, the honest limits: the provider guard forbids a
// silent fallback and the government project; the aggregate-budget guard refuses a worst-case over the cap; the Bash
// grant is least-privilege (Bash(node *)) with Write/Edit/Web disallowed — a surface reduction, NOT an OS sandbox.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const runEvals = join(root, 'verification', 'evals', 'run-evals.sh')

// Run the harness with a CLEAN env (env -i via execFileSync's env:) plus only the vars a case gives. DRY=1 => no model.
// Returns { code, out } where out is combined stdout+stderr.
function dry(env) {
  try {
    const out = execFileSync('bash', [runEvals, 'pilot'], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DRY: '1', ALLOW_SCAFFOLD: '1', ...env } })
    return { code: 0, out }
  } catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` } }
}

test('refuses to run with no EVAL_PROVIDER (no silent fallback to inherited credentials)', () => {
  const r = dry({ BUDGET: '1', CLAUDE_CODE_USE_VERTEX: '1' }) // simulate an inherited Vertex flag
  assert.notEqual(r.code, 0)
  assert.match(r.out, /EVAL_PROVIDER must be set explicitly/)
})

test('refuses EVAL_PROVIDER=anthropic if a Vertex flag is set (no provider mixing)', () => {
  const r = dry({ BUDGET: '1', EVAL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'x', CLAUDE_CODE_USE_VERTEX: '1' })
  assert.notEqual(r.code, 0)
  assert.match(r.out, /CLAUDE_CODE_USE_VERTEX=1 is set/)
})

test('refuses EVAL_PROVIDER=anthropic with no API key', () => {
  const r = dry({ BUDGET: '1', EVAL_PROVIDER: 'anthropic' })
  assert.notEqual(r.code, 0)
  assert.match(r.out, /needs ANTHROPIC_API_KEY/)
})

test('refuses a government/institutional Vertex project by generic pattern', () => {
  // a generic government-looking id; no real institution identifier is embedded in the repo
  const r = dry({ BUDGET: '1', EVAL_PROVIDER: 'vertex', ALLOW_VERTEX: '1', CLAUDE_CODE_USE_VERTEX: '1', EVAL_VERTEX_PROJECT: 'acme-gob-prod', ANTHROPIC_VERTEX_PROJECT_ID: 'acme-gob-prod' })
  assert.notEqual(r.code, 0)
  assert.match(r.out, /government\/institutional pattern/)
})

test('an operator can extend the denylist via EVAL_DENY_PROJECT_PATTERNS', () => {
  const r = dry({ BUDGET: '1', EVAL_PROVIDER: 'vertex', ALLOW_VERTEX: '1', CLAUDE_CODE_USE_VERTEX: '1', EVAL_VERTEX_PROJECT: 'myorg-internal', ANTHROPIC_VERTEX_PROJECT_ID: 'myorg-internal', EVAL_DENY_PROJECT_PATTERNS: '*myorg*' })
  assert.notEqual(r.code, 0)
  assert.match(r.out, /government\/institutional pattern/)
})

test('refuses a Vertex project mismatch between intended and active', () => {
  const r = dry({ BUDGET: '1', EVAL_PROVIDER: 'vertex', ALLOW_VERTEX: '1', CLAUDE_CODE_USE_VERTEX: '1', EVAL_VERTEX_PROJECT: 'my-personal', ANTHROPIC_VERTEX_PROJECT_ID: 'other-project' })
  assert.notEqual(r.code, 0)
  assert.match(r.out, /EVAL_VERTEX_PROJECT.*!=.*ANTHROPIC_VERTEX_PROJECT_ID/)
})

test('refuses Vertex without the explicit ALLOW_VERTEX personal-project confirmation', () => {
  const r = dry({ BUDGET: '1', EVAL_PROVIDER: 'vertex', CLAUDE_CODE_USE_VERTEX: '1', EVAL_VERTEX_PROJECT: 'my-personal', ANTHROPIC_VERTEX_PROJECT_ID: 'my-personal' })
  assert.notEqual(r.code, 0)
  assert.match(r.out, /needs ALLOW_VERTEX=1/)
})

test('refuses when the worst-case AGGREGATE budget exceeds MAX_TOTAL_USD (per-run ceiling is not the total)', () => {
  // BUDGET 5 per run x 1 run x 2 arms x 8 cases = 80 > default MAX_TOTAL_USD 5
  const r = dry({ BUDGET: '5', EVAL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'x' })
  assert.notEqual(r.code, 0)
  assert.match(r.out, /worst-case aggregate = BUDGET\(5\).*= 80 USD > MAX_TOTAL_USD\(5\)/)
})

test('a safe anthropic config assembles the command with least-privilege Bash and no publish', () => {
  const r = dry({ BUDGET: '1', MAX_TOTAL_USD: '20', EVAL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'x' })
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /^command:/m)
  // printf %q escapes the pattern, so match tolerant of backslash-escaping: Bash(node *) in any escaped form
  assert.match(r.out, /--allow-tools Bash\\?\(node\\?[ \\]+\\?\*\\?\)/, 'Bash is granted only for node, not full Bash')
  assert.match(r.out, /--disallow-tools Write Edit MultiEdit WebFetch WebSearch/, 'write/web tools are disallowed')
  assert.match(r.out, /--no-publish/, 'results stay local')
  assert.match(r.out, /--max-cost-usd 1/, 'the per-run ceiling is passed')
})

test('the Bash grant is documented as least-privilege, NOT a sandbox (honesty of the control)', () => {
  const src = execFileSync('cat', [runEvals], { encoding: 'utf8' })
  assert.match(src, /does NOT sandbox/, 'the script states Bash(node *) is not isolation')
  assert.match(src, /node, which can itself read\/write files/, 'it states node can still touch the fs')
})
