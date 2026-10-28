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
  full)
    [ -n "${BUDGET:-}" ] || { echo "full mode needs an explicit BUDGET=<usd>"; exit 2; }
    cases=$(find "$PLUGIN/evals" -mindepth 1 -maxdepth 1 -type d ! -name results ! -name mocks | wc -l | tr -d ' ')
    echo "estimated cost = cases ($cases) x runs ($RUNS) x arms (2) x cost per run (model $MODEL, up to max_turns per case) + judge calls"
    [ "${CONFIRM:-}" = "1" ] || { echo "set CONFIRM=1 to run the full suite under BUDGET=$BUDGET"; exit 2; }
    ;;
  *) echo "unknown mode: $MODE"; usage; exit 2 ;;
esac

command -v claude >/dev/null || { echo "claude CLI not found"; exit 2; }
# Vertex AI: the eval child sessions run sandboxed and do not discover Application Default Credentials
# implicitly. Pointing GOOGLE_APPLICATION_CREDENTIALS at the ADC file makes them authenticate (observed
# with Claude Code 2.1.312; without it every run fails with "Could not load Google Cloud credentials").
if [ "${CLAUDE_CODE_USE_VERTEX:-}" = "1" ] && [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
  adc="${CLOUDSDK_CONFIG:-$HOME/.config/gcloud}/application_default_credentials.json"
  [ -f "$adc" ] && export GOOGLE_APPLICATION_CREDENTIALS="$adc" && echo "vertex: using ADC file for the eval child sessions"
fi
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
  audit) cmd+=(--case '39-*' --scaffold --allow-tools Bash) ;;
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
