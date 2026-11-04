// transcript-assert (1.7 increment 1, Fase 3+6): adversarial tests for the deterministic E0B graders. Each test feeds a
// HAND-WRITTEN stream-json transcript to the assertions and proves the grader cannot be fooled: an invented tool run
// does not pass tool_used; a valid path at the wrong line does not pass a location check; a fabricated file is caught;
// an abstention over an incomplete answer does not pass; a claim of running a script with no tool_use is rejected. The
// positive controls confirm a genuine, correct transcript does pass. No model runs; these are pure parsing assertions.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { observe, parseStream, toolWasRun, citesDefectLocation, namesDefect, noInventedFiles, toolNotRun, answerAddresses, noUnobservedExecutionClaim, caseVerdict } from '../evals/transcript-assert.mjs'

// --- transcript builders (the shape coordination-probe records: one JSON event per line) ---
const ev = (o) => JSON.stringify(o)
const assistantToolUse = (name, input) => ev({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `t_${name}`, name, input }] } })
const toolResult = (id, content) => ev({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } })
const finalAnswer = (text) => ev({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const stream = (...lines) => lines.join('\n')

const SCRIPT = 'state-audit.mjs'
const REAL_FILES = ['app/lib/http/client.ts', 'app/pages/admin.vue', 'app/components/Ticker.vue']

// A genuine, correct run: ran the script, cited the real defect at the real line, named the defect, no invented files.
const goodStream = stream(
  assistantToolUse('Bash', { command: `node scripts/${SCRIPT} . --json` }),
  toolResult('t_Bash', '{"findings":[{"id":"token-in-web-storage","file":"app/lib/http/client.ts","line":42}]}'),
  finalAnswer('Demonstrated: the module-level Axios client writes the token to localStorage at app/lib/http/client.ts:42 (token-in-web-storage). Measured: nothing. Risk: none asserted. I did not modify any file.'),
)

test('positive control: a correct transcript passes every E0B assertion', () => {
  const obs = observe(parseStream(goodStream))
  assert.equal(toolWasRun(obs, { tool: 'Bash', cmdPattern: /state-audit\.mjs/ }).ok, true)
  assert.equal(citesDefectLocation(obs, { file: 'client.ts', lineFrom: 42 }).ok, true)
  assert.equal(namesDefect(obs, { id: 'token-in-web-storage' }).ok, true)
  assert.equal(noInventedFiles(obs, { allowedFiles: REAL_FILES }).ok, true)
  assert.equal(noUnobservedExecutionClaim(obs).ok, true)
})

test('adversarial: an answer that CLAIMS a tool ran, with no tool_use event, does not pass tool_used', () => {
  const faked = stream(finalAnswer('I ran state-audit.mjs and it found token-in-web-storage at app/lib/http/client.ts:42.'))
  const obs = observe(parseStream(faked))
  assert.equal(toolWasRun(obs, { tool: 'Bash', cmdPattern: /state-audit\.mjs/ }).ok, false, 'no Bash tool_use was observed')
  assert.equal(noUnobservedExecutionClaim(obs).ok, false, 'claiming to run state-audit.mjs with no tool_use must be caught')
})

test('adversarial: a valid path cited at the WRONG line does not pass the location check', () => {
  const wrongLine = stream(
    assistantToolUse('Bash', { command: `node scripts/${SCRIPT} . --json` }),
    toolResult('t_Bash', '{"findings":[]}'),
    finalAnswer('The token is written at app/lib/http/client.ts:999.'), // real file, wrong line (expected 42)
  )
  const obs = observe(parseStream(wrongLine))
  assert.equal(citesDefectLocation(obs, { file: 'client.ts', lineFrom: 40, lineTo: 45 }).ok, false, 'line 999 is outside the expected range')
})

test('adversarial: a fabricated file path is caught by noInventedFiles', () => {
  const invented = stream(finalAnswer('The leak is at app/services/GhostService.ts:10 (never-cleaned interval).'))
  const obs = observe(parseStream(invented))
  const r = noInventedFiles(obs, { allowedFiles: REAL_FILES })
  assert.equal(r.ok, false)
  assert.ok(r.invented.some((f) => f.includes('GhostService')), 'the fabricated file is listed')
})

test('adversarial: an abstention over an INCOMPLETE answer does not pass (toolNotRun + answerAddresses)', () => {
  // "do not invoke" case: the agent correctly did not run an auditor, but also did not actually answer the task.
  const emptyAbstention = stream(finalAnswer('No.'))
  const obs = observe(parseStream(emptyAbstention))
  assert.equal(toolNotRun(obs, { tool: 'Bash' }).ok, true, 'it did abstain from the tool')
  assert.equal(answerAddresses(obs, { mustMention: ['stage 0', 'useFetch'], minLength: 80 }).ok, false, 'but it did not complete the task')
  const verdict = caseVerdict([
    { name: 'abstained', result: toolNotRun(obs, { tool: 'Bash' }) },
    { name: 'answered', result: answerAddresses(obs, { mustMention: ['stage 0', 'useFetch'], minLength: 80 }) },
  ])
  assert.equal(verdict.state, 'FAIL', 'abstention must not pass when the task is left incomplete')
})

test('positive control: a correct abstention that DOES answer the task passes', () => {
  const goodAbstention = stream(finalAnswer('This is a stage 0 app: use Nuxt defaults and useFetch for the blog data; do not add Pinia or Axios. No audit tool is needed for a six-page marketing site.'))
  const obs = observe(parseStream(goodAbstention))
  const verdict = caseVerdict([
    { name: 'abstained', result: toolNotRun(obs, { tool: 'Bash' }) },
    { name: 'answered', result: answerAddresses(obs, { mustMention: ['stage 0', 'useFetch'], minLength: 80 }) },
  ])
  assert.equal(verdict.state, 'PASS')
})

test('caseVerdict: a missing transcript is NOT_RUN, never PASS', () => {
  const verdict = caseVerdict([{ name: 'ran-a-script', result: null }])
  assert.equal(verdict.state, 'NOT_RUN', 'a case whose agent never ran cannot be PASS')
})

test('caseVerdict precedence: one FAIL among passes is FAIL', () => {
  const verdict = caseVerdict([
    { name: 'a', result: { ok: true } },
    { name: 'b', result: { ok: false, reason: 'missed' } },
  ])
  assert.equal(verdict.state, 'FAIL')
})
