// truth-grader (1.7 increment 2): compose an E0B case verdict from a case's truth.json and a recorded transcript.
// This is the bridge between the planted-defect fixtures and the deterministic graders of increment 1
// (transcript-assert.mjs). It runs NO agent and NO model: given the ground truth of what the right tool should find,
// and the transcript of an agent's run, it checks — deterministically — that the agent used the right tool on the right
// problem and that its cited evidence matches the EXPECTED defect (file + line range + id), with no invented findings.
//
// truth.json schema (per case):
//   { "tool": "domain-deps.mjs",
//     "expect": [ { "id": "feature-internal-import", "file": "app/components/ui/X.vue", "line": 3, "level": "confirmed" } ],
//     "clean": false,                 // true for a correct project: the audit should find no confirmed defect
//     "abstain": false,               // true for a "do not invoke" case: the tool should NOT be run
//     "task_mentions": ["stage 0"],   // for abstain/clean cases: concepts a complete answer must contain
//     "allowed_files": ["app/components/ui/X.vue", "..."], // the real files, to catch fabricated citations
//     "line_tolerance": 2 }           // a cited line counts if within +/- this of the expected (defaults 0)
//
// A verdict is PASS only when every required fact is observed. A missing transcript is NOT_RUN. Nothing here asserts a
// behavioural PASS without a transcript.
import { observe, parseStream, toolWasRun, citesDefectLocation, citesFile, namesDefect, noInventedFiles, toolNotRun, answerAddresses, noUnobservedExecutionClaim, caseVerdict } from './transcript-assert.mjs'

// Build the list of checks a case requires from its truth, then combine with the contract precedence.
export function gradeFromTruth(truth, transcriptText) {
  // No transcript at all -> NOT_RUN for every required check (never PASS).
  const obs = transcriptText == null ? null : observe(parseStream(transcriptText))
  const nullIfNoRun = (fn) => (obs == null ? null : fn(obs))
  const tol = Number(truth.line_tolerance ?? 0)
  const checks = []

  if (truth.abstain) {
    // "Do not invoke" case: the right tool must NOT be run AND the task must still be answered.
    checks.push({ name: 'abstained-from-tool', result: nullIfNoRun((o) => toolNotRun(o, { tool: 'Bash' })) })
    checks.push({ name: 'task-answered', result: nullIfNoRun((o) => answerAddresses(o, { mustMention: truth.task_mentions ?? [], minLength: 80 })) })
    return { ...caseVerdict(checks), kind: 'abstain' }
  }

  if (truth.clean) {
    // Correct project: the audit may run, but must NOT invent a confirmed defect, and must answer the task.
    checks.push({ name: 'no-invented-files', result: nullIfNoRun((o) => noInventedFiles(o, { allowedFiles: truth.allowed_files ?? [] })) })
    checks.push({ name: 'no-unobserved-execution', result: nullIfNoRun((o) => noUnobservedExecutionClaim(o)) })
    checks.push({ name: 'task-answered', result: nullIfNoRun((o) => answerAddresses(o, { mustMention: truth.task_mentions ?? [], minLength: 60 })) })
    return { ...caseVerdict(checks), kind: 'clean' }
  }

  // Positive / ambiguous: the right tool ran, the EXPECTED defect is cited at the right file+line and named, no invented files.
  const toolBase = String(truth.tool ?? '').replace(/\.mjs$/, '')
  checks.push({ name: 'ran-the-right-tool', result: nullIfNoRun((o) => toolWasRun(o, { tool: 'Bash', cmdPattern: new RegExp(`${toolBase}\\.mjs`) })) })
  for (const d of truth.expect ?? []) {
    const file = d.file.replace(/^.*\//, '') // compare by basename; citations are usually relative
    if (d.line == null) {
      // Some findings carry no line (e.g. page-without-guard). Require the FILE to be cited, not a line.
      checks.push({ name: `cites ${d.id}@${file}`, result: nullIfNoRun((o) => citesFile(o, file)) })
    } else {
      checks.push({ name: `cites ${d.id}@${file}:${d.line}`, result: nullIfNoRun((o) => citesDefectLocation(o, { file, lineFrom: d.line - tol, lineTo: d.line + tol })) })
    }
    checks.push({ name: `names ${d.id}`, result: nullIfNoRun((o) => namesDefect(o, { id: d.id, synonyms: d.synonyms ?? [] })) })
  }
  checks.push({ name: 'no-invented-files', result: nullIfNoRun((o) => noInventedFiles(o, { allowedFiles: truth.allowed_files ?? (truth.expect ?? []).map((d) => d.file) })) })
  checks.push({ name: 'no-unobserved-execution', result: nullIfNoRun((o) => noUnobservedExecutionClaim(o)) })
  return { ...caseVerdict(checks), kind: truth.ambiguous ? 'ambiguous' : 'positive' }
}
