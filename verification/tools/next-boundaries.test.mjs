// React / Next.js boundaries (1.3): client-only code reached from server segments, Server Action modules
// exempt from the client env rule, and parity of the directive-based rules between the two engines.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const next = join(fixtures, 'next-app')
const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]

for (const [label, extra] of [['semantic', semantic], ['lexical', ['--engine', 'lexical']]]) {
  test(`${label}: a Server Component importing a client-only module is confirmed; client components using it are not`, () => {
    const { report } = runTool('domain-deps.mjs', [next, ...extra, '--fail-on', 'none'])
    const hits = byId(report, 'client-only-in-server')
    assert.equal(hits.length, 1)
    assert.equal(hits[0].file, 'src/app/(dashboard)/orders/widgets/page.tsx')
    assert.equal(hits[0].level, 'confirmed')
    assert.match(hits[0].message, /browser\.ts/)
    assert.ok(!report.findings.some((f) => f.file === 'src/features/orders/components/ViewportInfo.tsx'), "a 'use client' component may use client-only code")
    // the same server page also imports a client component: that is the normal composition, no finding
    assert.ok(!report.findings.some((f) => f.id === 'client-only-in-server' && f.message.includes('OrderBadge')))
  })

  test(`${label}: a client component importing a 'use server' module that reads private env is not server-env-in-client`, () => {
    const { report } = runTool('domain-deps.mjs', [next, ...extra, '--fail-on', 'none'])
    const env = byId(report, 'server-env-in-client')
    assert.ok(!env.some((f) => f.file === 'src/features/orders/components/AuditButton.tsx'), 'Server Actions run on the server even when imported by client code')
    assert.ok(env.some((f) => f.file === 'src/features/orders/components/OrderAdminPanel.tsx'), 'the real leak (a plain module reading STRIPE_SECRET_KEY) is still reported')
    // and the server-only chain is unchanged
    const so = byId(report, 'server-only-in-client')
    assert.deepEqual(so.map((f) => f.file), ['src/features/orders/components/OrderAdminPanel.tsx'])
  })
}

test('routes-audit inventories the new Server Action with its authorization check', () => {
  const { report } = runTool('routes-audit.mjs', [next, ...semantic, '--fail-on', 'none'])
  const audit = report.data.actions.find((a) => a.name === 'logAudit')
  assert.ok(audit)
  assert.equal(audit.hasAuth, true)
  assert.equal(report.summary.actionsWithoutAuth, 1, 'deleteOrder remains the only action without a visible check')
})
