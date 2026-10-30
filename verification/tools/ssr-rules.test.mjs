// SSR and hydration rules of state-audit (1.4): browser APIs and non-deterministic values evaluated during
// server rendering, with the guards that make them safe (onMounted/useEffect, import.meta.client, typeof window,
// event handlers, .client files) as negative controls.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fixtures, runTool } from './helpers.mjs'

const ssrApp = join(fixtures, 'ssr-app')
const nextApp = join(fixtures, 'next-app')
const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]
const truth = JSON.parse(readFileSync(join(ssrApp, 'expected-ssr.json'), 'utf8'))
const ssrFindings = (report) => report.findings.filter((f) => f.id === 'browser-api-in-setup' || f.id === 'nondeterministic-render')
const key = (f) => `${f.file}:${f.line} ${f.id} ${f.level}`

test('Nuxt with SSR: setup-level and module-level browser APIs are confirmed, random values are heuristic, guarded uses are silent', () => {
  const { report } = runTool('state-audit.mjs', [ssrApp, ...semantic, '--fail-on', 'none'])
  const got = new Set(ssrFindings(report).map(key))
  const want = new Set(truth.findings.map(key))
  assert.deepEqual([...want].filter((k) => !got.has(k)), [], 'false negatives')
  assert.deepEqual([...got].filter((k) => !want.has(k)), [], 'false positives')
  for (const f of truth.cleanFiles) assert.equal(ssrFindings(report).filter((x) => x.file === f).length, 0, `${f} must be clean`)
  const unsafe = ssrFindings(report).filter((f) => f.file === 'app/components/UnsafeSetup.vue')
  assert.ok(unsafe.every((f) => f.severity === 'high' && /top level of <script setup>/.test(f.message)))
  assert.ok(ssrFindings(report).some((f) => f.file === 'app/composables/useViewport.ts' && /module scope/.test(f.message)))
})

test('React: a browser API in the render body of a client component is heuristic; inside useEffect it is fine', () => {
  const { report } = runTool('state-audit.mjs', [nextApp, ...semantic, '--fail-on', 'none'])
  const got = ssrFindings(report).map(key)
  for (const f of truth.next.findings) assert.ok(got.includes(key(f)), `${key(f)} expected; got ${got.join(' | ')}`)
  for (const f of truth.next.cleanFiles) assert.ok(!got.some((k) => k.startsWith(f)), `${f} must be clean`)
  const render = ssrFindings(report).find((f) => f.file === 'src/features/orders/components/WindowInRender.tsx')
  assert.equal(render.level, 'heuristic')
  assert.match(render.message, /render body of WindowInRender/)
})

test('without SSR the same patterns are low severity blockers, and the lexical engine has no AST context so it stays silent', () => {
  const { cpSync, mkdtempSync, writeFileSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'fa-ssr-off-'))
  cpSync(ssrApp, dir, { recursive: true })
  writeFileSync(join(dir, 'nuxt.config.ts'), 'export default defineNuxtConfig({ ssr: false })\n')
  const off = runTool('state-audit.mjs', [dir, ...semantic, '--fail-on', 'none'])
  const unsafe = ssrFindings(off.report).filter((f) => f.file === 'app/components/UnsafeSetup.vue')
  assert.ok(unsafe.length >= 2)
  assert.ok(unsafe.every((f) => f.severity === 'low' && /ssr: false today/.test(f.message)))
  const lexical = runTool('state-audit.mjs', [ssrApp, '--engine', 'lexical', '--fail-on', 'none'])
  assert.equal(ssrFindings(lexical.report).length, 0, 'the rule needs the AST context; it never guesses lexically')
})

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
