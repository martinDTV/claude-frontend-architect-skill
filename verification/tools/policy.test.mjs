// Dependency policy (1.3): allowed pairs, documented exceptions, forbidden dependencies split into runtime
// and type-only, and cycles that the policy itself allows. Uses temporary copies of ts-paths with a policy
// added to its configuration; the fixture itself is unchanged.
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const tsPaths = join(fixtures, 'ts-paths')
const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]

function withPolicy(dependencies) {
  const dir = mkdtempSync(join(tmpdir(), 'fa-policy-'))
  cpSync(tsPaths, dir, { recursive: true })
  const cfg = JSON.parse(readFileSync(join(tsPaths, '.frontend-audit.json'), 'utf8'))
  writeFileSync(join(dir, '.frontend-audit.json'), JSON.stringify({ ...cfg, dependencies }))
  return dir
}

// ts-paths business pairs: checkout → orders (runtime through the barrel + type), checkout → billing (runtime),
// billing → checkout (runtime: the cycle), reports → orders (type-only), checkout → reports (runtime dynamic import)

test('without a policy nothing changes: no policy findings, summary.policy is null', () => {
  const { report } = runTool('domain-deps.mjs', [tsPaths, ...semantic, '--fail-on', 'none'])
  assert.equal(report.summary.policy, null)
  for (const id of ['forbidden-dependency', 'architecture-exception', 'allowed-cycle']) assert.equal(byId(report, id).length, 0, id)
  assert.equal(byId(report, 'domain-cycle').length, 1)
})

test('forbidden pairs: runtime coupling is confirmed/high, type-only coupling is confirmed/low and says so', () => {
  const dir = withPolicy({ allowed: [['checkout', 'orders']] })
  const { report } = runTool('domain-deps.mjs', [dir, ...semantic, '--fail-on', 'none'])
  const forbidden = byId(report, 'forbidden-dependency')
  const byPair = Object.fromEntries(forbidden.map((f) => [f.message.split(' is not')[0], f]))
  assert.ok(byPair['checkout → billing'], 'runtime forbidden pair')
  assert.equal(byPair['checkout → billing'].level, 'confirmed')
  assert.equal(byPair['checkout → billing'].severity, 'high')
  assert.ok(byPair['reports → orders'], 'type-only forbidden pair')
  assert.equal(byPair['reports → orders'].severity, 'low')
  assert.match(byPair['reports → orders'].message, /0 runtime and 1 type-only/)
  assert.match(byPair['reports → orders'].message, /compile-time coupling only/)
  assert.ok(!byPair['checkout → orders'], 'allowed pair produces no finding')
  assert.equal(report.summary.policy.allowedPairs, 1)
  assert.ok(report.summary.policy.forbiddenPairs >= 3)
  assert.ok(report.summary.policy.forbiddenFilePairs.runtime >= 2)
  assert.equal(report.summary.policy.forbiddenFilePairs.typeOnly, 1)
  assert.ok(report.data.pairs.every((p) => ['allowed', 'forbidden', 'excepted'].includes(p.policy)))
  assert.ok(report.notes.some((n) => /dependency policy applied: 1 allowed pair/.test(n)))
})

test('a documented exception keeps the pair visible as info with its counts, not as a violation', () => {
  const dir = withPolicy({ allowed: [['checkout', 'orders'], ['checkout', 'reports'], ['reports', 'orders']], exceptions: [{ from: 'checkout', to: 'billing', reason: 'invoice titles move to checkout in PR 4', since: '2026-10-27', until: 'PR 4' }] })
  const { report } = runTool('domain-deps.mjs', [dir, ...semantic, '--fail-on', 'none'])
  const exc = byId(report, 'architecture-exception')
  assert.equal(exc.length, 1)
  assert.match(exc[0].message, /checkout → billing is forbidden by the policy but tolerated: invoice titles move to checkout in PR 4 \(since 2026-10-27, until PR 4\); today 1 runtime and 0 type-only/)
  assert.ok(!byId(report, 'forbidden-dependency').some((f) => f.message.startsWith('checkout → billing')))
  // billing → checkout is still forbidden and still part of a cycle: the cycle stays a domain-cycle with the exception noted
  const cycle = byId(report, 'domain-cycle')
  assert.equal(cycle.length, 1)
  assert.match(cycle[0].message, /one direction is covered by a documented exception: invoice titles/)
})

test('a cycle whose both directions are allowed is reported as allowed-cycle (info), not as domain-cycle', () => {
  const dir = withPolicy({ allowed: [['checkout', 'billing'], ['billing', 'checkout'], ['checkout', 'orders'], ['checkout', 'reports'], ['reports', 'orders']] })
  const { code, report } = runTool('domain-deps.mjs', [dir, ...semantic])
  assert.equal(byId(report, 'domain-cycle').length, 0)
  const allowed = byId(report, 'allowed-cycle')
  assert.equal(allowed.length, 1)
  assert.equal(allowed[0].level, 'info')
  assert.match(allowed[0].message, /a cycle by design, not a violation/)
  assert.equal(report.summary.policy.allowedCycles, 1)
  assert.equal(report.summary.policy.forbiddenPairs, 0)
  // only the pre-existing confirmed finding (shared component importing a domain) decides the exit code
  assert.equal(code, byId(report, 'shared-imports-domain').some((f) => f.level === 'confirmed') ? 1 : 0)
})

test('the lexical engine applies the same policy to the edges it can see (tsconfig-only aliases stay invisible to it)', () => {
  const dir = withPolicy({ allowed: [['checkout', 'orders']] })
  const { report } = runTool('domain-deps.mjs', [dir, '--engine', 'lexical', '--fail-on', 'none'])
  const forbidden = byId(report, 'forbidden-dependency')
  // billing → checkout goes through '@/features/checkout/label', an alias the lexical table knows
  assert.ok(forbidden.some((f) => f.message.startsWith('billing → checkout') && f.severity === 'high'))
  // checkout → billing goes through '#core/billing/invoice', a tsconfig-only alias: the lexical engine has no edge, hence no finding (documented limit)
  assert.ok(!forbidden.some((f) => f.message.startsWith('checkout → billing')))
  // the allowed pair (checkout → orders) also travels through a tsconfig-only alias, so lexically it has no edges and is not counted
  assert.equal(report.summary.policy.allowedPairs, 0)
  assert.ok(report.summary.policy.forbiddenPairs >= 1)
})
