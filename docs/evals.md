# Evaluation suite

`plugins/frontend-architect/evals/` holds 48 cases for `claude plugin eval`. The suite exists to answer four questions: does the right skill activate (and only then), does the answer apply the references, does it refuse what should be refused, and does the reviewer use the scripts. Structure is validated offline by `verification/plugin-check.mjs`; scores exist only after a run, and a run costs money.

## Taxonomy

Every case carries tags in its frontmatter (`prompt.md`, or `case.yaml` for 39):

| Tag family | Values | Meaning |
|---|---|---|
| `activation:` | `architect`, `creative`, `both`, `none` | Which skill is expected to fire. `none` cases are outside the plugin's scope and exist to catch false positives |
| `domain:` | `architecture`, `visual`, `security`, `vue-nuxt`, `react-next`, `audit`, `state`, `performance`, `testing`, `delivery` | Knowledge area under test; several per case |
| `say-no` | — | The correct answer refuses the approach the prompt proposes (microfrontends, Redux, Three.js, a framework migration, tokens in localStorage) |
| `suite:` | `smoke`, `activation` | Membership in a low-cost subset runnable under one budget |

Each case also declares `description` (what the prompt is) and `expected_outcome` (what a good answer does), for humans reading results.

## How activation is measured

Each case has an indicator grader in `graders/`:

- `skill-activation.md` (or `skill-activation-architect.md` + `skill-activation-creative.md` for `activation:both`): `type: tool_used`, `tool: Skill`, `input_match` on the skill name, `min: 1`, `arm: with-only`. It is excluded from the baseline arm and, in `--ablation with-without` mode, treated as a plugin-fired indicator rather than part of the score. It answers "did the skill load for this prompt".
- `no-frontend-skill.md` on `activation:none` cases: `min: 0`, `max: 0`, `arm: both`. This one **is scored**: a frontend skill firing on a FastAPI or Terraform question is a false-positive activation and fails the case.

Quality is graded by `graders/criteria.md` (`type: llm`, PASS/FAIL rubric with positive and negative checks; the judge votes three times). Case 39 additionally asserts through `tool_used` on `Bash` that an audit script ran.

Limits: an indicator proves the `Skill` tool was called with that name, not that the references were read. "Applied the references" is judged only through the rubric.

## Classification

| Case | Expected activation | Domains | Say no | Cost class | Suites |
|---|---|---|---|---|---|
| 01-small-nuxt-no-pinia | architect | vue-nuxt, state, architecture | yes | standard | smoke, activation |
| 02-large-nuxt-with-pinia | architect | vue-nuxt, state, architecture |  | standard |  |
| 03-nuxt-colada-axios | architect | vue-nuxt, state |  | standard |  |
| 04-persistent-state | architect | vue-nuxt, state, security | yes | standard |  |
| 05-next-server-components | architect | react-next, architecture |  | standard |  |
| 06-next-tanstack-query | architect | react-next, state |  | standard |  |
| 07-modular-multi-domain | architect | react-next, architecture | yes | standard |  |
| 08-microfrontends-not-justified | architect | architecture, vue-nuxt | yes | standard | smoke |
| 09-microfrontends-justified | architect | architecture, security |  | standard |  |
| 10-nuxt-next-shared-auth | architect | security | yes | standard |  |
| 11-gsap-landing | creative | visual, vue-nuxt |  | standard |  |
| 12-tresjs-3d | creative | visual, vue-nuxt, performance |  | standard |  |
| 13-r3f-3d | creative | visual, react-next, performance |  | standard |  |
| 14-nuxt-ui-project | architect | vue-nuxt, architecture | yes | standard |  |
| 15-shadcn-project | architect | react-next, architecture |  | standard |  |
| 16-accessibility-audit | architect | vue-nuxt, audit |  | standard |  |
| 17-ssr-issues | architect | vue-nuxt, security, audit |  | standard |  |
| 18-security-review | architect | react-next, security |  | standard |  |
| 19-performance-analysis | architect | performance, vue-nuxt |  | standard |  |
| 20-refactor-existing | architect | vue-nuxt, state, architecture |  | standard |  |
| 21-landing-high-visual | creative | visual |  | standard | smoke, activation |
| 22-enterprise-dashboard-nuxt | both | visual, vue-nuxt, state |  | standard |  |
| 23-modular-erp-nuxt-80k | architect | architecture, vue-nuxt, audit | yes | standard | smoke |
| 24-medical-saas-multitenant | architect | security, vue-nuxt |  | standard |  |
| 25-existing-nuxt-spa-ssr-false | architect | vue-nuxt, security, architecture | yes | standard |  |
| 26-nextjs-hydration-bugs | architect | react-next |  | standard |  |
| 27-monorepo-decision | architect | architecture |  | standard |  |
| 28-microfrontends-nuxt4-module-federation | architect | architecture, vue-nuxt | yes | standard |  |
| 29-design-system-tokens-multi-framework | architect | architecture, visual |  | standard |  |
| 30-high-traffic-platform | architect | performance, architecture, vue-nuxt | yes | standard |  |
| 31-complex-form-wizard | architect | vue-nuxt, state |  | standard |  |
| 32-charts-dashboard-library | architect | react-next, performance, visual |  | standard |  |
| 33-no-global-store-react | architect | react-next, state | yes | standard |  |
| 34-no-threejs-hover-effect | creative | visual, vue-nuxt | yes | standard | smoke |
| 35-no-framework-migration | architect | architecture, performance | yes | standard |  |
| 36-legacy-options-api-refactor | architect | vue-nuxt, architecture |  | standard |  |
| 37-typescript-strict-adoption | architect | vue-nuxt |  | standard |  |
| 38-i18n-rtl-medical | architect | vue-nuxt |  | standard |  |
| 39-audit-with-tools | architect | audit, vue-nuxt, security |  | expensive |  |
| 40-session-expiry-race | architect | security, testing, vue-nuxt |  | standard |  |
| 41-memory-leak-animation | both | visual, testing, performance |  | standard |  |
| 42-observability-rum-setup | architect | delivery, performance, react-next |  | standard |  |
| 43-deployment-runtime-config | architect | delivery, vue-nuxt |  | standard |  |
| 44-fastapi-dependency-injection | none | - |  | cheap | activation, smoke |
| 45-postgres-index-choice | none | - |  | cheap | activation, smoke |
| 46-python-csv-script | none | - |  | cheap | activation |
| 47-terraform-s3-bucket-policy | none | - |  | cheap | activation |
| 48-nuxt-dashboard-restructure-visual | both | architecture, visual, vue-nuxt |  | standard | smoke |

Totals: 36 architect, 5 creative, 3 both, 4 none; 13 say-no cases; cost classes: 4 cheap (max_turns 4), 43 standard (max_turns 10), 1 expensive (case 39: 30 turns, scaffold, Bash).

## Running

Never run the suite without a cost ceiling. `verification/evals/run-evals.sh` always passes `--max-cost-usd`:

| Mode | Cases | Command |
|---|---|---|
| `smoke` | `suite:smoke`: 01, 08, 21, 23, 34, 44, 45, 48 | `./verification/evals/run-evals.sh smoke` (BUDGET defaults to 5) |
| `activation` | `suite:activation`: 44, 45, 46, 47 plus 01 and 21 as positive controls | `./verification/evals/run-evals.sh activation` |
| `tag <tag>` | one tag | `BUDGET=5 ./verification/evals/run-evals.sh tag domain:security` |
| `audit` | 39 only, scaffold and Bash enabled | `ALLOW_SCAFFOLD=1 ./verification/evals/run-evals.sh audit` |
| `full` | all 48 | `BUDGET=<usd> CONFIRM=1 ./verification/evals/run-evals.sh full` |

Defaults: one run per case and arm (`RUNS=1`), agent model `claude-haiku-5-5` (`MODEL=` to override), judge `haiku`, concurrency 1 so a budget overrun is bounded to one run, `--threshold 0` so the exit code reports budget and structure rather than scores (`THRESHOLD=` to override), `--no-publish`. `DRY=1` prints the command without running. Results go to `plugins/frontend-architect/evals/results/<mode>-<timestamp>/` (gitignored); `node verification/evals/summarize.mjs <dir>` prints per-case scores per arm, activation indicators, failed graders and cost fields.

Smoke subset rationale: one stage-0 "say no" (01), one microfrontends refusal (08), one creative activation (21), the 80k-line modular monolith decision (23), one Three.js refusal (34), two out-of-scope prompts (44, 45) and one case that needs both skills (48). Eight cases, both arms, one run each.

Budget policy: smoke and activation stay at or under 5 USD per invocation; the ceiling is checked by the CLI before each run launches. Running with the default (strong) model instead of Haiku measures the product users get but costs several times more; do it only for the full suite with an explicit budget.

## Reading results

- **With vs without**: the delta per case shows what the plugin adds. A case that passes without the plugin is not useless (it protects against regressions), but it is not evidence of value either.
- **Activation**: `skill-activation` false on an `architect`/`creative` case means the description did not trigger for that prompt; fix the description or the prompt, not the rubric. `no-frontend-skill` false means a false positive.
- **Say-no cases**: the rubric's negative checks are the point; a plausible, well-written answer that still recommends the rejected approach fails.
- **Noise**: one run per case is a smoke signal, not a measurement. Treat a single failure as a lead and re-run that case with `RUNS=3`.

## What an unexecuted suite means

Until a run is recorded below, the suite proves only that its structure is valid (`plugin-check.mjs`: every case has a prompt or `case.yaml`, graders with known types and required fields, YAML that parses). Scores, activation rates and the with/without comparison are unknown and must not be reported as passed.

## Environment notes (observed 2026-10-28, Claude Code 2.1.312)

- Under Vertex AI (`CLAUDE_CODE_USE_VERTEX=1`) the eval child sessions run sandboxed and do not discover Application Default Credentials by themselves: every run failed with "Could not load Google Cloud credentials" until `GOOGLE_APPLICATION_CREDENTIALS` pointed at the ADC file. `run-evals.sh` exports it automatically when the file exists.
- Pinned model ids may not be enabled on a given Vertex project (`claude-haiku-5-5` was not; the CLI suggested `claude-haiku-4-5@20251001`). The runner therefore defaults to the `haiku` alias; `sonnet` also worked. Set `MODEL` explicitly to pin.
- Failed runs still cost judge calls (about 0.001 USD each) and are reported as score 0 with an `error` field in `result.json`; `summarize.mjs` prints the error so a zero is never mistaken for a wrong answer.

## Results

### Smoke run, 2026-10-28 (Claude Code 2.1.312, Vertex AI, agent `haiku` alias, judge haiku, 1 run per arm, cost ceiling 3 USD)

Total cost 0.47 USD, 351 s, not partial. Scores are the `criteria` rubric (PASS requires 2 of 3 judge votes); activation is the indicator grader on the with-plugin arm (and both arms for `activation:none`).

| Case | Expected activation | Activated | With plugin | Without plugin | Turns with/without | Cost |
|---|---|---|---|---|---|---|
| 01-small-nuxt-no-pinia | architect | architect | PASS | PASS | 3 / 1 | 0.068 |
| 08-microfrontends-not-justified | architect | architect | PASS | FAIL | 3 / 1 | 0.051 |
| 21-landing-high-visual | creative | creative | PASS | FAIL | 1 / 1 | 0.138 |
| 23-modular-erp-nuxt-80k | architect | architect | PASS | PASS | 3 / 1 | 0.063 |
| 34-no-threejs-hover-effect | creative | creative | PASS | PASS | 3 / 1 | 0.043 |
| 44-fastapi-dependency-injection | none | none (both arms) | PASS | PASS | 1 / 1 | 0.049 |
| 45-postgres-index-choice | none | none (both arms) | PASS | PASS | 1 / 1 | 0.039 |
| 48-nuxt-dashboard-restructure-visual | both | architect + creative | FAIL | FAIL | 5 / 8 | 0.056 |

Reading: activation was correct in 8 of 8 cases (no false positive on the two out-of-scope prompts, both skills fired on the combined prompt). Quality: 7 of 8 with the plugin against 5 of 8 without; the two cases that only pass with the plugin are the microfrontends refusal and the visual direction of a landing page. Case 48 fails in both arms with Haiku: the rubric asks for structural and visual decisions at once and a short Haiku answer did not cover both lists. One run per case is a smoke signal, not a measurement; failures are leads to re-run with more runs and a stronger agent model (see below).

### Activation run and case 48 re-run

Activation suite (`suite:activation`, same settings, cost ceiling 2 USD): total 0.52 USD, 600 s, not partial.

| Case | Expected activation | Activated | With plugin | Without plugin | Turns with/without | Cost |
|---|---|---|---|---|---|---|
| 01-small-nuxt-no-pinia | architect | architect | PASS | FAIL | 3 / 1 | 0.062 |
| 21-landing-high-visual | creative | creative | PASS | PASS | 1 / 1 | 0.171 |
| 44-fastapi-dependency-injection | none | none (both arms) | PASS | PASS | 1 / 1 | 0.055 |
| 45-postgres-index-choice | none | none (both arms) | PASS | PASS | 1 / 1 | 0.039 |
| 46-python-csv-script | none | none (both arms) | PASS | FAIL (the baseline run timed out after 300 s and 13 turns) | 2 / 13 | 0.114 |
| 47-terraform-s3-bucket-policy | none | none (both arms) | PASS | PASS | 1 / 3 | 0.112 |

Across both runs, activation was correct 14 times out of 14 case-arms where it was measured: the frontend skills never fired on the six out-of-scope prompts, `frontend-architect` fired on every architecture prompt, `creative-frontend` on every visual prompt, and both on the combined prompt. Note the variance between the two runs of the same cases (01 passed without the plugin in the smoke run and failed in the activation run; 21 the opposite): with one run per arm and Haiku as both agent and judge, a single PASS/FAIL is noisy; only the activation indicators were stable.

Case 48 re-runs. With the original prompt and `sonnet` (2 runs per arm, 0.84 USD) all four runs failed for the same reason the Haiku run had: the prompt names concrete paths (`pages/operaciones/*`, 11 components), the agent looks for them in the empty sandbox and asks for the repository instead of answering; the skills fired in one of the two with-plugin runs. The prompt (and the similar case 07) now states that no repository is available and asks for the plan from the description. Re-run with `haiku` (1 run per arm, 0.07 USD): both arms PASS the rubric in one turn, but **neither skill fired in the with-plugin arm**: Haiku answered the self-contained prompt directly without calling the `Skill` tool.

Reading: single-skill prompts activated the right skill in every measured run (7 of 7 with-plugin runs across the smoke and activation suites); the combined architecture + visual prompt activated both skills in 2 of 4 with-plugin runs across Haiku and Sonnet and neither in the other 2. Mixed-domain prompts answered in one turn by a small model are the weak spot of activation, and the rubric passing without the skills shows the rubric is satisfiable from general knowledge for this case. Both facts are recorded as open items rather than tuned away.

Total spent on evaluations in this pass: about 2.1 USD (probes 0.18, smoke 0.47, activation 0.52, case 48 re-runs 0.91), under the 5 USD ceiling set for the delivery.

### Earlier attempts (kept for the record)

Two smoke invocations before the one above produced score 0 in every arm for environment reasons, not for answer quality: the first because the sandboxed child sessions could not load Google Cloud credentials (0.014 USD of judge calls), the second because `claude-haiku-5-5` is not enabled on this Vertex deployment (0 USD). Both are visible in their `result.json` as `error` fields; `summarize.mjs` now prints an `errors` column so such runs cannot be read as failures of the plugin.

### What is still not measured

The remaining 40 cases have never been scored. The structure of every case is validated offline by `plugin-check.mjs`; nothing about their pass rates is known until someone runs `./verification/evals/run-evals.sh full` with an explicit budget (estimate from the smoke run: about 0.06 USD per case per arm with Haiku, several times more with Sonnet or Opus and the default 3 runs).
