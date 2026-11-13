// eval-case-schema (post-1.7.0): the case.yaml schema 1.1 reads the agent's run settings from `execution.*`
// (execution.prompt, execution.allowed_tools, execution.max_turns, execution.timeout_seconds, execution.model,
// execution.disallowed_tools) and `context.*` (scaffold_script, history_file, add_dirs). Keys placed at the top
// level are ignored SILENTLY — neither `claude plugin validate` nor plugin-check rejects them. The first real pilot
// run (2026-11-10) exposed it: 21 cases declared allowed_tools/max_turns/timeout_seconds at the top level, so the
// agent ran with the defaults ([Read, Glob, Grep, Skill], 10 turns, 300 s) and Bash was never granted. This test
// pins the placement so a case can never again declare settings the CLI will not read.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const evalsDir = join(here, '..', '..', 'plugins', 'frontend-architect', 'evals')
const EXECUTION_KEYS = ['allowed_tools', 'disallowed_tools', 'max_turns', 'timeout_seconds', 'model', 'prompt', 'append_system_prompt', 'env']
const CONTEXT_KEYS = ['scaffold_script', 'history_file', 'add_dirs']
const cases = readdirSync(evalsDir).filter((d) => existsSync(join(evalsDir, d, 'case.yaml')))

test('every case.yaml keeps the run settings under execution: and context:, never at the top level', () => {
  assert.ok(cases.length >= 20, `expected the case.yaml cases, found ${cases.length}`)
  const bad = []
  for (const c of cases) {
    const lines = readFileSync(join(evalsDir, c, 'case.yaml'), 'utf8').split('\n')
    for (const l of lines) {
      const m = /^([a-z_]+):/.exec(l) // a top-level key has no indentation
      if (m && (EXECUTION_KEYS.includes(m[1]) || CONTEXT_KEYS.includes(m[1]))) bad.push(`${c}: top-level "${m[1]}" is ignored by the CLI`)
    }
  }
  assert.deepEqual(bad, [])
})

test('every tool-using case grants Bash under execution.allowed_tools (the pilot needs the audit scripts)', () => {
  const pilot = cases.filter((c) => /suite:pilot/.test(readFileSync(join(evalsDir, c, 'case.yaml'), 'utf8')) && !/abstain/.test(c))
  assert.equal(pilot.length, 6)
  for (const c of pilot) {
    const y = readFileSync(join(evalsDir, c, 'case.yaml'), 'utf8')
    const exec = y.split('\nexecution:\n')[1]?.split(/\n[a-z_]+:/)[0] ?? ''
    assert.match(exec, /^  allowed_tools: \[.*\bBash\b.*\]/m, `${c}: execution.allowed_tools must include Bash`)
    assert.match(exec, /^  max_turns: \d+/m, `${c}: execution.max_turns is set`)
  }
})

test('no eval scaffold resolves the repo root with `git rev-parse` first (the eval sandbox is its own git repo)', () => {
  const bad = []
  for (const c of cases) {
    const f = join(evalsDir, c, 'scaffold.sh')
    if (!existsSync(f)) continue
    const src = readFileSync(f, 'utf8')
    const git = src.indexOf('git rev-parse --show-toplevel'), self = src.indexOf('BASH_SOURCE[0]')
    if (git !== -1 && (self === -1 || git < self)) bad.push(`${c}: scaffold.sh trusts git rev-parse before its own path`)
  }
  assert.deepEqual(bad, [])
})
