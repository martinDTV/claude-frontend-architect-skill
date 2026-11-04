#!/usr/bin/env bash
# Runs `claude plugin eval` for this plugin with a cost ceiling that is always set.
#
# Modes:
#   smoke         representative subset (tag suite:smoke, 8 cases), 1 run per case, both arms
#   activation    activation:none cases plus two positive controls (tag suite:activation)
#   tag <tag>     any single tag from docs/evals.md (for example domain:security)
#   audit         case 39 only: scaffolds a Nuxt app and needs Bash (ALLOW_SCAFFOLD=1 required)
#   full          every case; needs BUDGET and CONFIRM=1
#
# Environment:
#   BUDGET=<usd>        hard ceiling passed as --max-cost-usd (default 5 for smoke/activation/tag/audit; required for full)
#   MODEL=<id>          agent model for all cases (default: the `haiku` alias, which resolves to the cheapest Haiku
#                       your deployment offers; pinned ids such as claude-haiku-5-5 may not be enabled on Vertex)
#   JUDGE_MODEL=<id>    LLM grader model (default haiku)
#   RUNS=<n>            runs per case and arm (default 1)
#   THRESHOLD=<0..1>    exit 1 below this case score (default 0: exit code reports budget and structure, not scores)
#   DRY=1               print the command and exit
#
# Results (JSON, HTML report, aggregate) go under plugins/frontend-architect/evals/results/<mode>-<timestamp>/,
# which is gitignored. Summarize with: node verification/evals/summarize.mjs <that dir>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLUGIN="$ROOT/plugins/frontend-architect"
MODE="${1:-help}"
ARG="${2:-}"
MODEL="${MODEL:-haiku}"
JUDGE_MODEL="${JUDGE_MODEL:-haiku}"
RUNS="${RUNS:-1}"
THRESHOLD="${THRESHOLD:-0}"
STAMP="$(date +%Y%m%d-%H%M%S)"

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; }

case "$MODE" in
  help|-h|--help) usage; exit 0 ;;
  smoke|activation) BUDGET="${BUDGET:-5}" ;;
  tag) [ -n "$ARG" ] || { echo "usage: $0 tag <tag>"; exit 2; }; BUDGET="${BUDGET:-5}" ;;
  audit) BUDGET="${BUDGET:-5}"; [ "${ALLOW_SCAFFOLD:-}" = "1" ] || { echo "audit mode runs the case's scaffold.sh as you; set ALLOW_SCAFFOLD=1 to accept"; exit 2; } ;;
  pilot) BUDGET="${BUDGET:-5}"; [ "${ALLOW_SCAFFOLD:-}" = "1" ] || { echo "pilot mode runs each case's scaffold.sh as you; set ALLOW_SCAFFOLD=1 to accept"; exit 2; } ;;
  full)
    [ -n "${BUDGET:-}" ] || { echo "full mode needs an explicit BUDGET=<usd>"; exit 2; }
    cases=$(find "$PLUGIN/evals" -mindepth 1 -maxdepth 1 -type d ! -name results ! -name mocks | wc -l | tr -d ' ')
    echo "estimated cost = cases ($cases) x runs ($RUNS) x arms (2) x cost per run (model $MODEL, up to max_turns per case) + judge calls"
    [ "${CONFIRM:-}" = "1" ] || { echo "set CONFIRM=1 to run the full suite under BUDGET=$BUDGET"; exit 2; }
    ;;
  *) echo "unknown mode: $MODE"; usage; exit 2 ;;
esac

command -v claude >/dev/null || { echo "claude CLI not found"; exit 2; }

# ---- provider selection (5A.1 hardening) ---------------------------------------------------------------
# The caller MUST choose the provider explicitly with EVAL_PROVIDER; the script never falls back silently to
# whatever credentials the shell happens to carry (this environment, for instance, has CLAUDE_CODE_USE_VERTEX=1
# and a government ADC in ~/.config/gcloud — running without this guard would bill that project). There is no
# default: an unset or unknown EVAL_PROVIDER refuses to run. The script does NOT itself authorize any provider;
# it only enforces that exactly one intended provider is active and that no other provider's config leaks in.
case "${EVAL_PROVIDER:-}" in
  anthropic)
    # Personal Anthropic API. Require a key and forbid any Vertex/Bedrock flags from leaking in.
    [ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "EVAL_PROVIDER=anthropic needs ANTHROPIC_API_KEY (personal); none set" >&2; exit 2; }
    [ "${CLAUDE_CODE_USE_VERTEX:-}" = "1" ] && { echo "refusing: EVAL_PROVIDER=anthropic but CLAUDE_CODE_USE_VERTEX=1 is set (run under env -i to clear it)" >&2; exit 2; }
    [ "${CLAUDE_CODE_USE_BEDROCK:-}" = "1" ] && { echo "refusing: EVAL_PROVIDER=anthropic but CLAUDE_CODE_USE_BEDROCK=1 is set" >&2; exit 2; }
    ;;
  vertex)
    # Vertex requires an EXPLICIT project that the caller must confirm is theirs to bill. Refuse known
    # institutional projects outright, and refuse a mismatch between the intended project and the active one.
    [ "${CLAUDE_CODE_USE_VERTEX:-}" = "1" ] || { echo "EVAL_PROVIDER=vertex needs CLAUDE_CODE_USE_VERTEX=1" >&2; exit 2; }
    [ -n "${EVAL_VERTEX_PROJECT:-}" ] || { echo "EVAL_PROVIDER=vertex needs EVAL_VERTEX_PROJECT=<your-personal-gcp-project>" >&2; exit 2; }
    [ -n "${ANTHROPIC_VERTEX_PROJECT_ID:-}" ] || { echo "EVAL_PROVIDER=vertex needs ANTHROPIC_VERTEX_PROJECT_ID set to the same project" >&2; exit 2; }
    [ "${EVAL_VERTEX_PROJECT}" = "${ANTHROPIC_VERTEX_PROJECT_ID}" ] || { echo "refusing: EVAL_VERTEX_PROJECT (${EVAL_VERTEX_PROJECT}) != ANTHROPIC_VERTEX_PROJECT_ID (${ANTHROPIC_VERTEX_PROJECT_ID})" >&2; exit 2; }
    # Refuse anything that looks like a government/institutional project by generic pattern. An operator can extend
    # the denylist for their own org via EVAL_DENY_PROJECT_PATTERNS (space-separated case-globs) without hard-coding
    # any specific institution's identifier in a public repo.
    for pat in '*gob*' '*.gov*' '*-gov-*' '*govt*' '*gobierno*' ${EVAL_DENY_PROJECT_PATTERNS:-}; do
      case "${EVAL_VERTEX_PROJECT}" in
        $pat) echo "refusing: ${EVAL_VERTEX_PROJECT} matches a government/institutional pattern (${pat}); the pilot must not bill it" >&2; exit 2 ;;
      esac
    done
    [ "${ALLOW_VERTEX:-}" = "1" ] || { echo "refusing: Vertex needs ALLOW_VERTEX=1 to confirm this is a personal project you are authorized to bill" >&2; exit 2; }
    [ "${CLAUDE_CODE_USE_BEDROCK:-}" = "1" ] && { echo "refusing: both Vertex and Bedrock flags are set" >&2; exit 2; }
    ;;
  *)
    echo "EVAL_PROVIDER must be set explicitly (anthropic | vertex). No default, no silent fallback." >&2
    echo "This environment currently has CLAUDE_CODE_USE_VERTEX=${CLAUDE_CODE_USE_VERTEX:-unset}; run the pilot under a clean env (env -i) with a personal provider." >&2
    exit 2
    ;;
esac

# ---- aggregate budget (5A.1 hardening) ----------------------------------------------------------------
# --max-cost-usd is PER RUN, not aggregate. Compute the worst-case aggregate (cases x runs x arms x per-run
# ceiling) and refuse if it exceeds MAX_TOTAL_USD (default 5). This is the script's own guard; it does NOT
# replace watching the real spend — Google Cloud / Anthropic budget *alerts* are notifications, not hard caps.
arms=2
pilot_cases=$(grep -rl 'suite:pilot' "$PLUGIN/evals"/*/case.yaml 2>/dev/null | wc -l | tr -d ' ')
[ "$MODE" = "pilot" ] && est_cases="$pilot_cases" || est_cases=1
worst_total=$(( BUDGET * RUNS * arms * est_cases ))
MAX_TOTAL_USD="${MAX_TOTAL_USD:-5}"
if [ "$worst_total" -gt "$MAX_TOTAL_USD" ]; then
  echo "refusing: worst-case aggregate = BUDGET($BUDGET) x RUNS($RUNS) x arms($arms) x cases($est_cases) = $worst_total USD > MAX_TOTAL_USD($MAX_TOTAL_USD)." >&2
  echo "lower BUDGET (per-run ceiling) or raise MAX_TOTAL_USD deliberately. Note: --max-cost-usd bounds ONE run, not the total." >&2
  exit 2
fi
echo "budget: per-run ceiling $BUDGET USD; worst-case aggregate $worst_total USD <= MAX_TOTAL_USD $MAX_TOTAL_USD (alerts are not hard caps; watch real spend)"
OUT="$PLUGIN/evals/results/$MODE-$STAMP"

cmd=(claude plugin eval "$PLUGIN"
  --runs "$RUNS" -j 1 --no-publish --trust-plugin
  --model "$MODEL" --judge-model "$JUDGE_MODEL"
  --max-cost-usd "$BUDGET" --threshold "$THRESHOLD"
  --output-dir "$OUT" --json "$OUT/result.json" --report "$OUT/report.html")
case "$MODE" in
  smoke) cmd+=(--tag suite:smoke) ;;
  activation) cmd+=(--tag suite:activation) ;;
  tag) cmd+=(--tag "$ARG") ;;
  # 5A.1 hardening: the audit/pilot cases need Bash ONLY to run the plugin's Node audit scripts, so grant
  # Bash(node *) rather than full Bash, and disallow the tools a read-only audit never needs (Write/Edit/
  # Web/MCP). This SHRINKS the surface — it does NOT sandbox: the CLI runs scaffolds and tools as you,
  # outside the OS sandbox, and Bash(node *) still runs node, which can itself read/write files via fs.
  # The real containment is that each case runs in a throwaway scaffold cwd and the prompts are read-only;
  # treat Bash(node *) as least-privilege, not isolation. See docs/review/v1.7.0-pilot-plan.md.
  audit) cmd+=(--case '39-*' --scaffold --allow-tools 'Bash(node *)' --disallow-tools Write Edit MultiEdit WebFetch WebSearch) ;;
  pilot) cmd+=(--tag suite:pilot --scaffold --allow-tools 'Bash(node *)' --disallow-tools Write Edit MultiEdit WebFetch WebSearch) ;;
  full) ;;
esac

echo "budget ceiling: $BUDGET USD (checked before each run; with -j 1 the overrun is bounded to one run)"
printf 'command:'; printf ' %q' "${cmd[@]}"; echo
[ "${DRY:-}" = "1" ] && exit 0
mkdir -p "$OUT"
set +e
"${cmd[@]}"
code=$?
set -e
echo "exit code: $code (0 ok, 1 below threshold, 2 budget hit or partial)"
echo "results: $OUT"
[ -f "$OUT/result.json" ] && node "$ROOT/verification/evals/summarize.mjs" "$OUT" || true
exit $code
