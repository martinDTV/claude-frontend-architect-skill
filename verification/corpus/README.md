# Adversarial corpus for FP/FN measurement (1.7 increment 3)

This corpus measures the **auditors'** precision, recall and false-positive / false-negative behaviour.
It is deliberately different from the increment-2 eval fixtures: there the `truth.json` was *verified by
running the tool* (right for grading an agent's behaviour), which cannot measure the tool's own FP/FN —
that would be circular. Here the ground truth is written **from the source, by a human, before and
independent of the auditor's output**, so a divergence between the tool and the truth is a real finding,
not noise.

## Layout

```
verification/corpus/
  <area>/              area = arch | state | routes | perf | a11y | bundle | ds (design-system inventory, 1.8)
    <NN-name>/         one case
      <app files>      a small realistic project (or a built fixture for bundle)
      ground-truth.json
    ...
  measure.mjs          the deterministic measurer (TP/FP/FN/TN, precision/recall/F1)
```

## ground-truth.json schema

```json
{
  "area": "state",
  "tool": "state-audit.mjs",
  "category": "real-defect | correct-suspicious | ambiguous | syntactic-variant | insufficient-context | insufficient-evidence | combined-defects | negative-control",
  "engine": "lexical | semantic",          // how the tool must be invoked for this case (some rules need the semantic engine)
  "source_of_truth": "one sentence on how a human derived this truth from the code, NOT from the tool",
  "expected": [                            // the defects a correct auditor SHOULD report (empty for a clean/negative case)
    { "id": "token-in-web-storage", "file": "app/x.ts", "line": 12,
      "min_level": "confirmed | heuristic",  // the weakest acceptable level; a heuristic where confirmed is due is a partial, named
      "rationale": "why this is genuinely a defect, from the code" }
  ],
  "forbidden": [                           // ids the tool must NOT report here (traps: correct code that looks like a defect)
    { "id": "module-level-mutable-state", "file": "app/y.ts", "why_not_a_defect": "it is a frozen const, not mutable" }
  ],
  "out_of_scope": [ "ids this tool legitimately does not cover; NOT counted as TN" ]
}
```

## Counting rules (see measure.mjs)

Per case, each tool finding and each ground-truth item is classified:
- **TP**: a tool finding matches an `expected` item (same id + file + line within tolerance).
- **FN**: an `expected` item with no matching tool finding — a **missed defect**.
- **FP**: a tool finding that matches a `forbidden` item, or a defect-level finding (confirmed/heuristic)
  on a `negative-control` case / a file with no `expected` item — an **invented finding**.
- **TN**: a `negative-control` case (or a clean file) where the tool reports no defect-level finding.
  Only genuine clean cases count as TN; **out-of-scope ids never count as TN**.
- **heuristic**: a finding reported at `heuristic` where the truth says `confirmed` is partial — recorded
  separately, not silently a TP.
- **insufficient-evidence / out-of-scope**: recorded in their own buckets, excluded from the
  precision/recall denominators (an out-of-scope miss is not an FN).

The measurer never derives the truth from the tool. It reports real numbers, including bad ones; it does
not relax a rule to improve a score, and does not claim 100% unless every case genuinely supports it.

## Methodology clarifications (1.7 increment 3C, from the 3B independent audit)

**Unit of evaluation.** TP, FP and FN are counted **per finding** (each expected defect; each tool
finding). The clean/negative result is counted **per case** ("clean-held": a clean or negative-control
case where the tool raised no defect-level finding). `precision = TP/(TP+FP)` and `recall = TP/(TP+FN)`
use only the per-finding counts; clean-held never enters them. It is therefore NOT a confusion-matrix TN
and the measurer labels the column "clean-held", not "TN", so no one reads it as a comparable cell.

**Scenario polarity on `insufficient-*` categories.** The categories `insufficient-context` and
`insufficient-evidence` name a *tool situation* (the signal the auditor has to work with), not a truth
polarity. The same category therefore appears in two polarities, now made explicit with a
`scenario_polarity` field in ground-truth.json:
- `scenario_polarity: "miss"` — real defective code the tool cannot reach (e.g. a value only a dataflow
  pass would resolve). `expected[]` is populated; a tool silence is an FN (measures recall).
- `scenario_polarity: "trap"` — correct code a naive tool might over-flag (e.g. auth in an imported
  helper). `expected[]` is empty; a tool finding is an FP (measures precision).
Because one label spans both polarities, **do not compare a per-category metric across areas** without
splitting by `scenario_polarity`; the headline precision/recall are unaffected (they aggregate TP/FP/FN
regardless of label).

**Known coverage gaps (`coverage_gaps[]`).** A real defect the tool does NOT claim to cover (e.g. a
custom ARIA widget's missing name, which `ui-audit` leaves to its native-element scope). Declared in
`coverage_gaps[]`, counted in the `cov-gap` column, and **excluded from recall** — it is not an FN of a
rule the tool has, but it is surfaced so a genuine miss is visible instead of hidden inside `out_of_scope`.
This is distinct from `out_of_scope` (ids the tool emits that are not defect-level, e.g. info findings).

**The bundle size-metric scope / bundle/03 knife-edge.** `route-attribution`'s `route-heavy-initial-chunk`
keys off the **single largest initial chunk** ≥ 150 KB gzip, not the route's total initial JS. Case
`bundle/03` is a route whose total initial JS is 169.6 KB yet whose largest single chunk is 149.8 KB — it
is correctly modeled as not firing the heuristic. This is the metric's exact scope, documented so the
clean verdict is not mistaken for "this route ships little JS".

**No claim of general coverage.** A 100% per area means only that the area's authored cases are handled;
it does not demonstrate coverage of patterns the corpus does not contain. The development corpus is an
in-sample baseline; generalization is measured separately by the hold-out set
(`verification/corpus-holdout/`, see `docs/review/v1.7.0-holdout-design.md`), reported side by side and
never merged into a single headline.
