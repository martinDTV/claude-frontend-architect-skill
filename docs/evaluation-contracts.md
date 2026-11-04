# Evaluation evidence contracts (1.7 increment 1)

Frontend Architect's evaluation suite must never confuse a structural check with observed behaviour,
nor award a favourable score without sufficient evidence. This document fixes the vocabulary: four
evidence tiers and six states. Every eval case, grader and report in the project is classified against
these. The tiers describe *what kind of proof a result rests on*; the states describe *what happened*.

The guiding rule, in one line: **a result may be PASS only when the evidence its tier requires was
actually produced.** An agent that never ran cannot be PASS. A screenshot that passed axe is not a
PASS for visual quality.

## Evidence tiers

### E0A — Local deterministic, no model
Computed on this machine with no model and no network. The audit scripts run against fixtures with a
hand-written ground truth (`expected-*.json`, `expected.md`); the result is a byte comparison or a
numeric precision/recall. `plugin-check.mjs` structural checks are E0A. These can be run now, for
free, and are fully reproducible.
- Proof: a deterministic computation over committed inputs.
- Cost: none. No provider, no authorization.
- Example: `ui-audit.mjs` on `fixtures/ui-app` matches `expected-findings.json` (100% precision/recall
  on the fixture's rules); `perf-budget.mjs` returns UNAVAILABLE for a missing metric.

### E0B — Real agent run, deterministic grader
An agent (`claude -p`) actually runs the prompt, and the grader is deterministic: `tool_used` (a tool
was invoked, matched by regex on the transcript), `regex` (a pattern over the transcript), or a
comparison of the agent's cited output against a ground truth. **The grader needs no LLM judge, but
the run still needs a model and therefore authorization and a cost ceiling.** The distinguishing fact
of E0B over E0A: the result reflects *observed agent behaviour*, parsed from the transcript as events,
never from the model's prose.
- Proof: events in a recorded transcript (tool invocations, cited paths), checked deterministically.
- Cost: the model that runs the agent (mitigable: Haiku, one run, a budget ceiling). The grader is
  free; the agent is not.
- Hard rule: **E0B is NOT_RUN until the agent has actually run.** `--regrade` of an existing transcript
  is a re-computation of the grader over a prior run, not a new behavioural run (see below).

### E1 — Model-judge quality grade
A `llm` grader reads the agent's response and judges quality (diagnosis correctness, resistance to
over-engineering, honest treatment of uncertainty). Requires both the agent run (a model) and a judge
model, hence an authorized provider and an approved budget.
- Proof: a model's judgement against written criteria.
- Cost: agent run + judge. Highest variable cost; non-deterministic.
- Hard rule: **E1 is NOT_RUN without an authorized provider; it is never declared approved unrun.**

### E2 — Human judgement
Visual quality, aesthetic, information hierarchy, "does the caption compete with the subject", density
for the audience, taste. Not automatable. axe / Lighthouse / Core Web Vitals / a screenshot diff are
E0A objective checks; **passing them is never E2.** The system produces evidence (a contact sheet of
captures) for a human to judge and marks the result HUMAN_REVIEW_REQUIRED.
- Proof: a person using or looking at the product.
- Cost: human time.
- Hard rule: **no E0A metric may be reported as an E2 verdict.** A page that passes axe is accessible
  by that rule's measure, not "well designed".

## States

| State | Meaning | Allowed when |
|---|---|---|
| `PASS` | The evidence the tier requires was produced and satisfied the criteria | the run/computation happened and met the bar |
| `FAIL` | The evidence was produced and did not satisfy the criteria | the run/computation happened and missed the bar |
| `NOT_RUN` | The required run/computation has not happened | E0B without an agent run; E1 without a provider; anything provider- or budget-gated |
| `INSUFFICIENT_EVIDENCE` | The run happened but produced too little to decide (e.g. a transcript with no tool events for a tool_used grader that needs them; too few samples) | the artefact exists but under-determines the verdict |
| `INVALID_CONFIGURATION` | The case/grader cannot be evaluated as written (missing fixture, unit/profile mismatch, malformed grader) | a configuration error, reported not silently skipped |
| `HUMAN_REVIEW_REQUIRED` | The criterion is E2; only a person can decide | any E2 criterion |

Precedence when combining a case's graders into a case verdict: `INVALID_CONFIGURATION` >
`NOT_RUN` > `INSUFFICIENT_EVIDENCE` > `FAIL` > `HUMAN_REVIEW_REQUIRED` > `PASS`. That is: a case is only
`PASS` when every grader that can be decided is PASS and none is blocked, unrun, under-evidenced or
misconfigured; an E2 criterion in the mix caps the case at `HUMAN_REVIEW_REQUIRED` for that dimension.

## The `--regrade` distinction (never a new behavioural run)

`run-evals.sh`/`summarize.mjs` and `coordination-probe --regrade` re-run the *grader* over a
*previously recorded* transcript. This recomputes an E0B/E1 grade from an old run; it is an E0A
operation over a stored artefact. It must be labelled as a regrade of run `<id>` dated `<when>`, never
as a fresh behavioural measurement. A baseline built only from regrades of old transcripts is a
structural baseline, not a behavioural one.

## What this does not change

The historical results and frozen baselines (1.2.0–1.4.0 contract snapshots and finding baselines)
are untouched. Eval cases 85–88 and 89–95 remain **NOT_RUN — PROVIDER_NOT_AUTHORIZED**; no score is
claimed for them. This document classifies evidence; it does not run anything.
