import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

const nuxt = join(fixtures, 'nuxt-app')
const next = join(fixtures, 'next-app')

import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]

for (const [label, extra] of [['lexical', ['--engine', 'lexical']], ['semantic', semantic]]) {
  test(`nuxt (${label}): page inventory, guards, public routes, redirect-only pages and middleware arrays with comments`, () => {
    const { code, report } = runTool('routes-audit.mjs', [nuxt, ...extra])
    assert.equal(code, 0, 'no confirmed findings in the fixture')
    const page = (path) => report.data.pages.find((p) => p.path === path)
    assert.equal(page('/').status, 'guarded')
    assert.deepEqual(page('/crm').middleware, ['auth'])
    assert.equal(page('/obra/:id').file, 'app/pages/obra/[id].vue')
    assert.equal(page('/auth/login').status, 'public', 'publicRoutes glob from config')
    assert.equal(page('/planos').status, 'unguarded', 'tenant.global.ts is not an auth guard')
    // D1 (1.4): comments inside the middleware array no longer hide the names (both parsers)
    assert.deepEqual(page('/settings').middleware, ['auth', 'step-up'])
    assert.equal(page('/settings').status, 'guarded')
    assert.equal(page('/settings').metaParser, label === 'semantic' ? 'ast' : 'lexical')
    // D1 (1.4): redirect-only pages are not "unguarded"; their destination is checked
    assert.equal(page('/legacy').status, 'redirect')
    assert.equal(page('/legacy').redirectTo, '/crm')
    assert.equal(page('/legacy').redirectGuarded, true)
    assert.equal(page('/legacy/report').status, 'redirect')
    assert.equal(page('/legacy/report').redirectTo, '/obra/1')
    assert.equal(page('/legacy/report').redirectGuarded, true, 'dynamic segment matched')
    const unguarded = byId(report, 'page-without-guard')
    assert.equal(unguarded.length, 1)
    assert.equal(unguarded[0].file, 'app/pages/planos/index.vue')
    assert.equal(unguarded[0].level, 'heuristic')
    const redirects = byId(report, 'redirect-page')
    assert.equal(redirects.length, 2)
    assert.ok(redirects.every((f) => f.level === 'info' && f.severity === 'info'))
    assert.equal(report.summary.redirects, 2)
    assert.equal(report.summary.globalMiddleware, 'tenant')
    assert.equal(report.summary.namedMiddleware, 'auth, step-up')
    assert.equal(byId(report, 'unknown-middleware').length, 0)
  })
}

test('nuxt: positive controls, a middleware name that does not exist is confirmed and a redirect to an unguarded page is medium', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fa-routes-'))
  cpSync(nuxt, dir, { recursive: true })
  writeFileSync(join(dir, 'app', 'pages', 'broken.vue'), "<script setup lang=\"ts\">\ndefinePageMeta({ middleware: ['auth', /* typo */ 'nope'] })\n</script>\n<template><p>x</p></template>\n")
  writeFileSync(join(dir, 'app', 'pages', 'old-planos.vue'), "<script setup lang=\"ts\">\nawait navigateTo('/planos')\n</script>\n")
  const { code, report } = runTool('routes-audit.mjs', [dir, '--engine', 'lexical'])
  assert.equal(code, 1, 'confirmed finding')
  const unknown = byId(report, 'unknown-middleware')
  assert.equal(unknown.length, 1)
  assert.match(unknown[0].message, /nope/)
  assert.ok(!unknown[0].message.includes('auth'))
  const redirect = byId(report, 'redirect-page').find((f) => f.file === 'app/pages/old-planos.vue')
  assert.ok(redirect)
  assert.equal(redirect.severity, 'medium')
  assert.match(redirect.message, /without a guard/)
  // a page with real content that happens to call navigateTo is not a redirect page
  writeFileSync(join(dir, 'app', 'pages', 'busy.vue'), "<script setup lang=\"ts\">\nconst go = () => navigateTo('/crm')\n</script>\n<template><button @click=\"go\">go</button></template>\n")
  const again = runTool('routes-audit.mjs', [dir, '--engine', 'lexical', '--fail-on', 'none'])
  assert.equal(again.report.data.pages.find((p) => p.path === '/busy').status, 'unguarded')
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
