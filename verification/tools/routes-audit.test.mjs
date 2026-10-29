import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const nuxt = join(fixtures, 'nuxt-app')
const next = join(fixtures, 'next-app')

test('nuxt: page inventory, guards, public routes and non-auth global middleware', () => {
  const { code, report } = runTool('routes-audit.mjs', [nuxt])
  assert.equal(code, 0, 'no confirmed findings in the fixture')
  const page = (path) => report.data.pages.find((p) => p.path === path)
  assert.equal(page('/').status, 'guarded')
  assert.deepEqual(page('/crm').middleware, ['auth'])
  assert.equal(page('/obra/:id').file, 'app/pages/obra/[id].vue')
  assert.equal(page('/auth/login').status, 'public', 'publicRoutes glob from config')
  assert.equal(page('/planos').status, 'unguarded', 'tenant.global.ts is not an auth guard')
  const unguarded = byId(report, 'page-without-guard')
  assert.equal(unguarded.length, 1)
  assert.equal(unguarded[0].file, 'app/pages/planos/index.vue')
  assert.equal(unguarded[0].level, 'heuristic')
  assert.equal(report.summary.globalMiddleware, 'tenant')
  assert.equal(report.summary.namedMiddleware, 'auth')
  assert.equal(byId(report, 'unknown-middleware').length, 0)
})

test('next: use client on a page is confirmed; server actions and handlers without auth are heuristic', () => {
  const { code, report } = runTool('routes-audit.mjs', [next])
  assert.equal(code, 1)
  const client = byId(report, 'client-boundary-too-high')
  assert.equal(client.length, 1)
  assert.equal(client[0].file, 'src/app/page.tsx')
  const actions = report.data.actions
  // 1.3 fixture adds audit.actions.ts (logAudit, with an authorize call) next to orders.actions.ts
  assert.deepEqual(actions.map((a) => [a.name, a.hasAuth]), [['logAudit', true], ['deleteOrder', false], ['renameOrder', true]])
  const noAuth = byId(report, 'server-action-without-auth')
  assert.equal(noAuth.length, 1)
  assert.match(noAuth[0].message, /deleteOrder/)
  assert.equal(noAuth[0].severity, 'high')
  assert.equal(byId(report, 'server-action-without-validation').length, 3, 'deleteOrder, renameOrder and the 1.3 logAudit parse nothing')
  const handler = byId(report, 'route-handler-without-auth')
  assert.equal(handler.length, 1)
  assert.match(handler[0].message, /POST \/api\/webhooks/)
  assert.deepEqual(report.data.matcherPatterns, ['/dashboard/:path*'])
  const orders = report.data.routes.find((r) => r.path === '/orders' && r.kind === 'page')
  assert.ok(orders, 'route group (dashboard) stripped from the path')
  assert.equal(orders.covered, false)
})
