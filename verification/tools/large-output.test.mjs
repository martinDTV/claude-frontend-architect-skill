import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scriptsDir } from './helpers.mjs'

/** A synthetic Nuxt app large enough that the --json report exceeds 64 KiB (the pipe buffer size). */
function bigNuxtApp() {
  const root = mkdtempSync(join(tmpdir(), 'fa-big-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'big', dependencies: { nuxt: '^4.6.0' } }))
  writeFileSync(join(root, 'nuxt.config.ts'), 'export default defineNuxtConfig({})\n')
  mkdirSync(join(root, 'app', 'composables'), { recursive: true })
  mkdirSync(join(root, 'app', 'pages'), { recursive: true })
  for (let i = 0; i < 120; i++) writeFileSync(join(root, 'app', 'composables', `useThing${i}.ts`), `export function useThing${i}() { return ${i} }\n`)
  for (let p = 0; p < 60; p++) {
    const uses = Array.from({ length: 10 }, (_, k) => `useThing${(p * 7 + k) % 120}()`).join('; ')
    writeFileSync(join(root, 'app', 'pages', `page${p}.vue`), `<script setup lang="ts">\n${uses}\n</script>\n<template><div>p${p}</div></template>\n`)
  }
  return root
}

test('--json piped through stdout is complete even when it exceeds 64 KiB (no process.exit truncation)', () => {
  const root = bigNuxtApp()
  const r = spawnSync(process.execPath, [join(scriptsDir, 'domain-deps.mjs'), root, '--json', '--fail-on', 'none'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.stdout.length > 65536, `output should exceed 64 KiB, got ${r.stdout.length}`)
  const report = JSON.parse(r.stdout) // throws on truncation
  assert.ok(report.data.edges.length >= 600)
  // exit codes still propagate through process.exitCode
  const bad = spawnSync(process.execPath, [join(scriptsDir, 'domain-deps.mjs'), '/nonexistent'], { encoding: 'utf8' })
  assert.equal(bad.status, 2)
})
