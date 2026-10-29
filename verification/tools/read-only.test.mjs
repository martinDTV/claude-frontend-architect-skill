// Operational safety (1.3): the audit scripts never execute project code, never spawn processes, never
// touch the network and never write into the audited project (the one documented write is the explicit
// --write-baseline of contracts-check, which targets a path the user names).
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fixtures, runTool, scriptsDir } from './helpers.mjs'

const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]

function listScripts(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listScripts(p))
    else if (e.name.endsWith('.mjs')) out.push(p)
  }
  return out
}

function snapshot(dir) {
  const out = new Map()
  const visit = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) visit(p)
      else out.set(relative(dir, p), `${statSync(p).size}:${createHash('sha1').update(readFileSync(p)).digest('hex')}`)
    }
  }
  visit(dir)
  return out
}

test('static scan: no process execution, network or filesystem writes in the scripts (except the documented baseline write)', () => {
  const forbidden = [/\bchild_process\b/, /(?<![.\w])spawn(?:Sync)?\s*\(/, /(?<![.\w])exec(?:Sync|File)\s*\(/, /(?<![.\w])exec\s*\(\s*['"`]/, /\bfetch\s*\(/, /node:(?:net|http|https|dgram|tls)\b/, /\bwriteFileSync?\s*\(/, /\bappendFileSync?\s*\(/, /\bmkdirSync?\s*\(/, /\brmSync?\s*\(/, /\bunlinkSync?\s*\(/, /\brenameSync?\s*\(/, /\bprocess\.env\b/]
  const allowed = new Map([
    ['contracts-check.mjs', [/\bwriteFileSync?\s*\(/]], // --write-baseline, explicit and documented
    ['domain-deps.mjs', [/\bprocess\.env\b/]], // regex source text and messages about process.env, never a read
    ['lib/semantic/resolver.mjs', [/\bchild_process\b/]], // name inside the Node built-ins list
  ])
  const hits = []
  for (const file of listScripts(scriptsDir)) {
    const rel = relative(scriptsDir, file)
    const text = readFileSync(file, 'utf8')
    for (const re of forbidden) {
      if (!re.test(text)) continue
      if ((allowed.get(rel) ?? []).some((a) => a.source === re.source)) continue
      hits.push(`${rel}: ${re}`)
    }
  }
  assert.deepEqual(hits, [])
})

test('dynamic check: running every tool with the semantic engine leaves the audited project byte-identical', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fa-ro-'))
  cpSync(join(fixtures, 'nuxt-app'), dir, { recursive: true })
  const before = snapshot(dir)
  for (const tool of ['domain-deps.mjs', 'contracts-check.mjs', 'state-audit.mjs', 'routes-audit.mjs', 'leak-patterns.mjs', 'component-complexity.mjs']) {
    const { code } = runTool(tool, [dir, ...semantic, '--fail-on', 'none'])
    assert.equal(code, 0, tool)
  }
  const bb = runTool('bundle-budget.mjs', [dir], { parse: false })
  assert.equal(bb.code, 2, 'no build: refuses, does not build')
  const after = snapshot(dir)
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'no file created or deleted')
  for (const [k, v] of before) assert.equal(after.get(k), v, `${k} modified`)
})

test('the lexical engine is the mode that loads nothing from the audited project', () => {
  const { report } = runTool('domain-deps.mjs', [join(fixtures, 'ts-paths'), '--engine', 'lexical', '--fail-on', 'none'])
  assert.equal(report.analysis.engine, 'lexical')
  assert.equal(report.analysis.typescript, null)
  assert.equal(report.analysis.vueCompiler, null)
})
