// transcript-assert (1.7 increment 1): deterministic, model-free assertions over a recorded agent transcript
// (stream-json, one JSON event per line — the same shape coordination-probe.mjs records). These are the E0B graders:
// they parse OBSERVED EVENTS, never the model's prose claims. The design principle (1.7 increment 1, Fase 3):
//
//   A tool_used match does NOT prove the diagnosis is correct. A regex hit on "path:line" does NOT prove the location
//   is the expected defect. So each assertion checks a SPECIFIC, verifiable fact and nothing more, and the helpers
//   compose into a case verdict only when every required fact is observed.
//
// Nothing here runs an agent or a model. It is pure parsing + comparison, used by the adversarial tests that feed it
// hand-written transcripts (including manipulated ones that must NOT pass).

export function parseStream(text) {
  const events = []
  for (const line of String(text).split('\n')) {
    const t = line.trim()
    if (!t) continue
    try { events.push(JSON.parse(t)) } catch { /* ignore non-JSON lines, as the real stream can interleave them */ }
  }
  return events
}

// Extract the observable primitives from the event stream: tool uses (with input), tool results (by id), and the
// assistant's final text. This is the single source of truth every assertion reads from.
export function observe(events) {
  const toolUses = []
  const toolResults = new Map()
  let finalText = ''
  for (const [index, e] of events.entries()) {
    const content = Array.isArray(e?.message?.content) ? e.message.content : (Array.isArray(e?.content) ? e.content : [])
    for (const c of content) {
      if (c?.type === 'tool_use') toolUses.push({ id: c.id, name: c.name, input: c.input ?? {}, index })
      if (c?.type === 'tool_result') toolResults.set(c.tool_use_id, typeof c.content === 'string' ? c.content : JSON.stringify(c.content ?? ''))
      if (c?.type === 'text' && typeof c.text === 'string' && (e.type === 'assistant' || e.type === 'result')) finalText += c.text + '\n'
    }
    if (typeof e?.result === 'string') finalText += e.result + '\n' // the final result event can carry the answer as a string
  }
  return { toolUses, toolResults, finalText }
}

// (1) A specific tool was actually invoked, optionally with its command/input matching a pattern. Reads tool_use
// events, not the prose. `cmdPattern` matches against the Bash command string or the stringified input.
export function toolWasRun(obs, { tool, cmdPattern } = {}) {
  const uses = obs.toolUses.filter((t) => t.name === tool)
  if (!uses.length) return { ok: false, reason: `no ${tool} tool_use observed` }
  if (!cmdPattern) return { ok: true, matches: uses.length }
  const re = cmdPattern instanceof RegExp ? cmdPattern : new RegExp(cmdPattern)
  const hit = uses.find((u) => re.test(u.input?.command ?? '') || re.test(JSON.stringify(u.input)))
  return hit ? { ok: true, matches: 1 } : { ok: false, reason: `${tool} ran but no invocation matched ${re}` }
}

// (2) The agent's answer cites a defect at the EXPECTED file and line/range, not merely some valid-looking path.
// Requires the file path AND a line within the expected [from,to] range to appear together (same citation).
// This is the guard against "cited a real path that is not the expected defect".
export function citesDefectLocation(obs, { file, lineFrom, lineTo = lineFrom } = {}) {
  const text = obs.finalText
  // find "<...file...>:<line>" citations; file may be a suffix of a longer path
  const re = new RegExp(`${file.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}[^\\n]{0,40}?:(\\d+)`, 'g')
  for (const m of text.matchAll(re)) {
    const line = Number(m[1])
    if (line >= lineFrom && line <= lineTo) return { ok: true, line }
  }
  return { ok: false, reason: `no citation of ${file}:${lineFrom}${lineTo !== lineFrom ? `-${lineTo}` : ''} found (a valid path at the wrong line does not count)` }
}

// (2b) The answer cites the expected FILE (for findings that carry no line, e.g. page-without-guard). The file name
// must appear; a line is not required. Still catches citing a different file.
export function citesFile(obs, file) {
  const base = file.replace(/^.*\//, '')
  return obs.finalText.includes(base) ? { ok: true } : { ok: false, reason: `the expected file ${base} is not cited` }
}

// (3) A named defect identifier (the thing the planted defect is about) is actually named in the answer.
export function namesDefect(obs, { id, synonyms = [] } = {}) {
  const needles = [id, ...synonyms].map((s) => s.toLowerCase())
  const hay = obs.finalText.toLowerCase()
  return needles.some((n) => hay.includes(n)) ? { ok: true } : { ok: false, reason: `defect "${id}" not named` }
}

// (4) No invented findings: every file the answer cites as a defect location must be one of the known-real files.
// Catches a transcript that fabricates a plausible path the project does not contain.
export function noInventedFiles(obs, { allowedFiles = [] } = {}) {
  const cited = new Set()
  for (const m of obs.finalText.matchAll(/([\w./-]+\.(?:ts|tsx|js|mjs|vue|jsx)):\d+/g)) cited.add(m[1])
  const allowed = allowedFiles.map((f) => f.replace(/^.*\//, '')) // compare by basename, citations are often relative
  const invented = [...cited].filter((c) => !allowed.some((a) => c.endsWith(a)))
  return invented.length ? { ok: false, reason: `cites files not in the known set: ${invented.join(', ')}`, invented } : { ok: true }
}

// (5) Abstention: the agent did NOT run a given tool (for "do not invoke" cases). The companion check that the task was
// still answered is separate (answerMentions) so an abstention never passes on an empty/incomplete answer.
export function toolNotRun(obs, { tool } = {}) {
  const uses = obs.toolUses.filter((t) => t.name === tool)
  return uses.length ? { ok: false, reason: `${tool} was invoked ${uses.length}x but this case expects abstention` } : { ok: true }
}

// (6) The answer actually addresses the task (non-empty, mentions required concepts). Used WITH toolNotRun so a
// "do not invoke" case cannot pass by simply doing nothing.
export function answerAddresses(obs, { mustMention = [], minLength = 80 } = {}) {
  const text = obs.finalText.trim()
  if (text.length < minLength) return { ok: false, reason: `answer too short (${text.length} < ${minLength}) — abstention is not a completed task` }
  const low = text.toLowerCase()
  const missing = mustMention.filter((m) => !low.includes(String(m).toLowerCase()))
  return missing.length ? { ok: false, reason: `answer does not mention: ${missing.join(', ')}` } : { ok: true }
}

// (7) No fabricated tool execution: the answer does not claim a tool produced output that no tool_result carries.
// Catches "I ran X and it found Y" when no matching tool_use/tool_result exists.
export function noUnobservedExecutionClaim(obs, { toolNamePattern = /ran\s+(the\s+)?(\w[\w.-]*\.mjs)/gi } = {}) {
  const claimed = [...obs.finalText.matchAll(toolNamePattern)].map((m) => m[2] ?? m[1]).filter(Boolean)
  const ranCommands = obs.toolUses.map((t) => JSON.stringify(t.input)).join(' ')
  const unbacked = claimed.filter((name) => !ranCommands.includes(name))
  return unbacked.length ? { ok: false, reason: `claims running ${unbacked.join(', ')} with no matching tool_use`, unbacked } : { ok: true }
}

// Compose a case verdict from required facts, applying the contract precedence
// (INVALID_CONFIGURATION > NOT_RUN > INSUFFICIENT_EVIDENCE > FAIL > HUMAN_REVIEW_REQUIRED > PASS).
export function caseVerdict(checks) {
  // checks: [{ name, result: {ok, reason}, kind? }]. A check with result === null means NOT_RUN (no transcript).
  if (checks.some((c) => c.result === null)) return { state: 'NOT_RUN', failed: checks.filter((c) => c.result === null).map((c) => c.name) }
  const failed = checks.filter((c) => c.result && c.result.ok === false)
  if (failed.length) return { state: 'FAIL', failed: failed.map((c) => `${c.name}: ${c.result.reason}`) }
  return { state: 'PASS', failed: [] }
}
