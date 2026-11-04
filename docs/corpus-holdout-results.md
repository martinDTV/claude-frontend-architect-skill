# Hold-out validation results — development vs known-limit vs blind generalization (1.7 increment 3C)

Three sets, measured and reported SEPARATELY (never merged into one headline), at plugin SHA `920b1a8`.
Ground truth for every case is written from the source by hand; the generalization set (B) truth was written
WITHOUT consulting the auditor's output. No agent or model was run.

## 1. Development corpus (in-sample, 46 cases)

| area | cases | TP | FP | FN | clean-held | heur-partial | cov-gap | precision | recall | F1 |
|------|-------|----|----|----|------------|--------------|---------|-----------|--------|----|
| arch | 8 | 10 | 0 | 0 | 3 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| state | 8 | 9 | 0 | 1 | 2 | 0 | 0 | 100.0% | 90.0% | 94.7% |
| routes | 8 | 10 | 2 | 0 | 2 | 0 | 0 | 83.3% | 100.0% | 90.9% |
| perf | 8 | 10 | 0 | 2 | 3 | 0 | 0 | 100.0% | 83.3% | 90.9% |
| a11y | 8 | 12 | 0 | 0 | 4 | 0 | 1 | 100.0% | 100.0% | 100.0% |
| bundle | 6 | 2 | 0 | 0 | 4 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| **all** | 46 | 53 | 2 | 3 | 18 | 0 | 1 | 96.4% | 94.6% | 95.5% |

## 2. Hold-out set A — known-limit reproductions (4 cases; NOT a blind check)

Deliberately reproduce the measured dev limits in NEW shapes, to test whether each limit generalizes.
Low precision/recall here is the EXPECTED, desired outcome: it confirms the limit is structural, not
specific to the dev case. This set is not independent validation — it targets known failures on purpose.

| area | cases | TP | FP | FN | clean-held | heur-partial | cov-gap | precision | recall | F1 |
|------|-------|----|----|----|------------|--------------|---------|-----------|--------|----|
| arch | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| state | 1 | 0 | 0 | 1 | 0 | 0 | 0 | n/a | 0.0% | n/a |
| routes | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0.0% | n/a | n/a |
| perf | 1 | 0 | 0 | 1 | 0 | 0 | 0 | n/a | 0.0% | n/a |
| a11y | 0 | 0 | 0 | 0 | 0 | 0 | 0 | n/a | n/a | n/a |
| bundle | 0 | 0 | 0 | 0 | 0 | 0 | 0 | n/a | n/a | n/a |
| **all** | 4 | 2 | 1 | 2 | 0 | 0 | 0 | 66.7% | 50.0% | 57.1% |

Per-case: state/A01 FN (token with generic key AND value — the variable-resolution limit reproduces);
routes/A01 FP (auth via an imported helper named guardRequest — the single-file FP reproduces);
perf/A01 FN (heavy module via a bare side-effect import — the import-kind FN reproduces);
arch/A02 2 TP (reclassified from a B case whose hand truth proved incomplete — see note below).

## 3. Hold-out set B — blind generalization (17 cases; the independent check)

New patterns in new frameworks/libraries/carriers, truth written without consulting tool output.

| area | cases | TP | FP | FN | clean-held | heur-partial | cov-gap | precision | recall | F1 |
|------|-------|----|----|----|------------|--------------|---------|-----------|--------|----|
| arch | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| state | 3 | 2 | 0 | 0 | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| routes | 3 | 5 | 0 | 0 | 0 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| perf | 3 | 5 | 0 | 0 | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| a11y | 3 | 2 | 0 | 0 | 2 | 0 | 1 | 100.0% | 100.0% | 100.0% |
| bundle | 3 | 2 | 0 | 0 | 1 | 0 | 0 | 100.0% | 100.0% | 100.0% |
| **all** | 17 | 17 | 0 | 0 | 6 | 0 | 1 | 100.0% | 100.0% | 100.0% |

## Reading these numbers

- **Development 96.4%/94.6%** is in-sample: authored and measured in one pass. Not a general-performance number.
- **Set A 66.7%/50.0%** is intentionally low: 3 of 4 known limits (state FN, routes FP, perf FN) reproduce on
  fresh variants, proving they are structural limits of static analysis, not artifacts of a single dev case.
- **Set B 100%/100%** is the meaningful generalization signal: on 17 blindly-authored cases across new surfaces,
  the auditors produced NO new false positive or false negative beyond the known limits. This is evidence the
  tools generalize on these patterns — NOT proof of general correctness (17 cases is a check, not a census).
- The three sets are NEVER summed into one figure: a merged number would hide that set A is adversarially
  targeted at failures and set B is a clean generalization pass.

## Honesty note: one B case was reclassified to A (not silently edited)

`arch/B03-type-only-forbidden-pair` was authored blind, but on measurement its hand truth proved OBJECTIVELY
INCOMPLETE: it modeled only a policy `forbidden-dependency` and omitted two genuine `feature-internal-import`
findings (both files import inventory's internal types file while inventory/index.ts re-exports them — the same
rule the dev corpus already establishes as correct). Because the truth was wrong (not merely divergent), the case
cannot measure blind generalization. It was reclassified to set A as `arch/A02` with the truth corrected and the
history recorded in its provenance, rather than edited silently inside the blind set. The two findings are correct
tool behavior, not false positives. This is itself a finding: a hold-out's value depends on the quality of its
truth, and a 100% blind pass must be read with that caveat.

## Limits of generalization (still true after the hold-out)

- 21 hold-out cases are a check, not a census; a 100% blind pass bounds but does not eliminate unknown FP/FN.
- All cases remain small synthetic apps; real codebases are larger and messier.
- The known structural limits (variable resolution, cross-file auth/validation, import-kind coverage, custom ARIA
  widgets, transferred bytes) are confirmed to generalize (set A) and are documented, not fixed (not authorized).
- Set B truth is independent, but a hold-out is only unseen until a fix targets a case; the no-rule-tuning and
  retire-on-fix rules in docs/review/v1.7.0-holdout-design.md govern keeping it valid.
