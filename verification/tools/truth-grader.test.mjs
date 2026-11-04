// truth-grader (1.7 increment 2): end-to-end test of the fixture -> E0B grader bridge. It loads the REAL truth.json of
// the tool-using cases and feeds hand-written transcripts to gradeFromTruth, proving the contract: a transcript that
// genuinely runs the right tool and cites the expected defect PASSES; transcripts that fake the run, cite the wrong
// line, invent a file, miss the planted defect, or abstain without finishing the task do NOT pass; a clean-project
// answer that invents a defect FAILS; and a missing transcript is NOT_RUN. No agent or model runs here.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { gradeFromTruth } from '../evals/truth-grader.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const evals = join(here, '..', '..', 'plugins', 'frontend-architect', 'evals')
const truth = (c) => JSON.parse(readFileSync(join(evals, c, 'truth.json'), 'utf8'))

// transcript builders (stream-json shape coordination-probe records)
const ev = (o) => JSON.stringify(o)
const bash = (cmd) => ev({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `t${Math.random()}`, name: 'Bash', input: { command: cmd } }] } })
const answer = (text) => ev({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const T = (...l) => l.join('\n')

// --- 96 arch-positive: feature-internal-import at app/features/orders/useOrders.ts:1 (confirmed) ---
test('96 arch-positive: a correct run that cites the planted defect PASSES', () => {
  const tr = T(
    bash('node scripts/domain-deps.mjs . --engine lexical --json'),
    answer('Demonstrated: app/features/orders/useOrders.ts:1 imports billing internals, bypassing its index.ts (feature-internal-import). Fix: import from the public index. No file modified.'),
  )
  assert.equal(gradeFromTruth(truth('96-arch-positive'), tr).state, 'PASS')
})

test('96 arch-positive: faking the tool run (no Bash event) does NOT pass', () => {
  const tr = T(answer('I ran domain-deps.mjs; app/features/orders/useOrders.ts:1 has feature-internal-import.'))
  const v = gradeFromTruth(truth('96-arch-positive'), tr)
  assert.equal(v.state, 'FAIL')
  assert.ok(v.failed.some((f) => /ran-the-right-tool|unobserved/.test(f)))
})

test('96 arch-positive: citing the right file at the WRONG line does not pass', () => {
  const tr = T(
    bash('node scripts/domain-deps.mjs . --json'),
    answer('feature-internal-import at app/features/orders/useOrders.ts:88.'),
  )
  assert.equal(gradeFromTruth(truth('96-arch-positive'), tr).state, 'FAIL')
})

test('96 arch-positive: missing the planted defect entirely does not pass', () => {
  const tr = T(bash('node scripts/domain-deps.mjs . --json'), answer('Looks fine, no issues.'))
  assert.equal(gradeFromTruth(truth('96-arch-positive'), tr).state, 'FAIL')
})

// --- 97 arch-clean: no defect; inventing one must FAIL, a correct read must PASS ---
test('97 arch-clean: inventing a defect in a clean project FAILS (no-invented-files)', () => {
  const tr = T(
    bash('node scripts/domain-deps.mjs . --json'),
    answer('Found a boundary violation at app/features/ghost/Phantom.ts:3.'),
  )
  assert.equal(gradeFromTruth(truth('97-arch-clean'), tr).state, 'FAIL')
})

test('97 arch-clean: a correct "no confirmed defects" answer that cites only real files PASSES', () => {
  // allowed_files lists the real scaffolded files so citing them (to explain they are clean) is not "invented".
  const t = { ...truth('97-arch-clean'), allowed_files: ['app/features/orders/index.ts', 'app/layouts/default.vue'], task_mentions: ['boundaries'] }
  const tr = T(
    bash('node scripts/domain-deps.mjs . --json'),
    answer('The module boundaries are clean: cross-feature imports go through the public index.ts and the shell depends only on core. No confirmed architecture defect.'),
  )
  assert.equal(gradeFromTruth(t, tr).state, 'PASS')
})

// --- 99 state-positive: multiple confirmed defects + a line-less finding ---
test('99 state-positive: citing every expected defect PASSES; the line-less finding needs only its file', () => {
  const tr = T(
    bash('node scripts/state-audit.mjs . --engine semantic --json'),
    answer([
      'Demonstrated findings:',
      '- app/composables/useApi.ts:3 module-level-http-client-mutable-auth (one shared client, mutable Authorization — a cross-request leak under SSR)',
      '- app/stores/auth.ts:7 token-in-web-storage',
      '- app/stores/auth.ts:8 token-in-web-storage',
      '- app/stores/auth.ts logout-without-cache-clear (logout removes a token but clears no cache)',
      'No file modified.',
    ].join('\n')),
  )
  assert.equal(gradeFromTruth(truth('99-state-positive'), tr).state, 'PASS')
})

// --- 102 routes-positive: page-without-guard has no line; only the file is required ---
test('102 routes-positive: citing the guard-less page by file PASSES even without a line', () => {
  const tr = T(
    bash('node scripts/routes-audit.mjs . --json'),
    answer('app/pages/billing/invoices.vue has no auth middleware and the project has no global guard (page-without-guard). Fix: add middleware. No file modified.'),
  )
  assert.equal(gradeFromTruth(truth('102-routes-positive'), tr).state, 'PASS')
})

test('102 routes-positive: a valid but DIFFERENT page does not pass (wrong problem)', () => {
  const tr = T(
    bash('node scripts/routes-audit.mjs . --json'),
    answer('app/pages/account.vue is missing a guard (page-without-guard).'), // account is the guarded control, not the defect
  )
  assert.equal(gradeFromTruth(truth('102-routes-positive'), tr).state, 'FAIL')
})

// --- 113 abstention: must abstain from the auditor AND answer the task ---
test('113 abstain: a correct answer that does not reach for an auditor PASSES', () => {
  const tr = T(answer('For a six-page marketing site this is a stage 0 app: use Nuxt defaults and useFetch for the blog data; no Pinia, no Axios, and no audit tool is warranted here.'))
  assert.equal(gradeFromTruth(truth('113-abstain-small-landing'), tr).state, 'PASS')
})

test('113 abstain: running an auditor anyway FAILS (over-tooling)', () => {
  const tr = T(
    bash('node scripts/domain-deps.mjs . --json'),
    answer('Stage 0, useFetch, no Pinia.'),
  )
  assert.equal(gradeFromTruth(truth('113-abstain-small-landing'), tr).state, 'FAIL')
})

test('113 abstain: abstaining but NOT answering the task FAILS', () => {
  const tr = T(answer('No.'))
  assert.equal(gradeFromTruth(truth('113-abstain-small-landing'), tr).state, 'FAIL')
})

// --- 111 bundle-positive: the heavy-chunk finding is attributed to a route path, not a line ---
test('111 bundle-positive: citing the heavy route by path PASSES', () => {
  const tr = T(
    bash('node scripts/route-attribution.mjs . --no-perf --json'),
    answer('The /heavy route ships a 226 KB gzip chunk in its initial set (route-heavy-initial-chunk); confirm with the analyzer. This is build-associated size, not transferred bytes.'),
  )
  assert.equal(gradeFromTruth(truth('111-bundle-positive'), tr).state, 'PASS')
})

// --- NOT_RUN: no transcript is never PASS, for any case ---
test('any case with no transcript is NOT_RUN, never PASS', () => {
  for (const c of ['96-arch-positive', '99-state-positive', '102-routes-positive', '97-arch-clean', '111-bundle-positive', '113-abstain-small-landing']) {
    assert.equal(gradeFromTruth(truth(c), null).state, 'NOT_RUN', c)
  }
})
