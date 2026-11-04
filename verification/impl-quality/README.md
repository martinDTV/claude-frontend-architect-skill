# Frontend implementation-quality evaluation (1.7 increment 4)

This evaluates **built artifacts** — a running, type-checking, rendered app — not a written plan. It does
NOT add a new runner, a new browser auditor, or a new app: it is a **contract layer** over the
infrastructure that already exists (the five reference apps and their `verification/<proj>/check-*.mjs`
scripts, `browser-audit`, `perf-budget`, `design-consistency`, `domain-deps`, the capture gallery). Its
job is to (1) say which existing signal proves which quality axis, (2) fix explicit accept/reject
conditions per scenario, (3) keep the automatable axes strictly separate from human visual judgement,
and (4) carry known-defect negative controls so a green axis is a real signal, not an assumption.

## The four axes and their evidence tiers

Reusing the evidence contract of `docs/evaluation-contracts.md`:

| Axis | What proves it | Tier | Hard rule |
|---|---|---|---|
| **A. Functional & architecture** | `tsc`/`next build`/`nuxt prepare` pass; the project's own functional tests pass; `domain-deps`/`state-audit` clean on the built app; the brief's required features are present and work in the browser check | **E0A** (tools/build) + **E0B** where a browser check drives the app | An app that does not compile is **FAIL-functional** — never rescued by any other axis |
| **B. Accessibility** | `ui-audit` static; `browser-audit` axe, keyboard reachability, focus, reflow at 320px, text-scale 200% | **E0A/E0B** | A clean axe run is **not** a WCAG-conformance claim; partial checks never assert full conformance |
| **C. Performance** | `bundle-budget` gzip vs budget; `route-attribution` initial-vs-deferred; `perf-audit` static patterns; lab vitals only where valid measurements exist and profiles are compatible | **E0A/E0B** | built bytes ≠ transferred bytes; lab ≠ field; a missing metric is UNAVAILABLE, never invented |
| **D. Visual & UX** | hierarchy, composition, density, token consistency, responsive, identity, motion/reduced-motion, empty/error/loading states | **E0A for the mechanical parts** (token consistency via `design-consistency`, reduced-motion honored, the five data-view states present); **E2 (human)** for the judgement | **A clean axe/Lighthouse/snapshot is NEVER a PASS for visual quality.** The automatable part is E0; taste, hierarchy and identity are HUMAN_REVIEW_REQUIRED and produce a capture set, never a verdict |

**Axis independence.** The four axes are scored independently and never mask each other: a beautiful app
that fails `tsc` is FAIL-functional; a functionally perfect app with an axe violation is FAIL-a11y; a
fast, accessible, correct app is still HUMAN_REVIEW_REQUIRED on visual quality until a person looks. A
scenario's overall state is the worst axis, with D capped at HUMAN_REVIEW_REQUIRED for its judgement part.

## States (from docs/evaluation-contracts.md)

`PASS` / `FAIL` / `NOT_RUN` (artifact not built / needs a model) / `INSUFFICIENT_EVIDENCE` /
`INVALID_CONFIGURATION` (contract cannot be evaluated as written) / `HUMAN_REVIEW_REQUIRED` (axis D
judgement). No axis is PASS unless its tier's evidence was actually produced; a non-existent artifact is
NOT_RUN or INVALID_CONFIGURATION, never a silent pass.

## Scenario → existing reference app (no new apps built)

| Scenario | Reference app | Existing driver |
|---|---|---|
| 1. Professional landing | Lumen (Next) | `verification/next/check-landing.mjs` |
| 2. SaaS dashboard | Atlas dashboards (Next + Nuxt) | `check-saas.mjs` |
| 3. Enterprise application | Atlas (Next + Nuxt) | `check-design.mjs` + `check-saas.mjs` |
| 4. E-commerce | Ember (Nuxt) | `check-shop.mjs` |
| 5. Creative / interactive | 3D labs (Next + Nuxt) | `check-lab.mjs` + `check-motion.mjs` |

Each scenario has a `scenario.json` contract (schema below). The contract names the reference app and the
existing check that drives it; it does not re-implement the check.

## scenario.json schema

```json
{
  "id": "saas-dashboard",
  "brief": "one paragraph: what the app must be and do",
  "reference_app": "verification/next (Atlas dashboards)",
  "driver": "check-saas.mjs",
  "required_features": [ "URL-synced table state", "row actions with confirm", "empty/error/loading states" ],
  "architecture_constraints": [ "no server data copied into a store", "modules by capability" ],
  "axes": {
    "functional": { "tier": "E0A+E0B", "accept": "tsc + build pass; required_features present in the browser check; domain-deps/state-audit no confirmed", "reject": "does not compile OR a required feature missing OR a confirmed boundary/state defect" },
    "accessibility": { "tier": "E0A+E0B", "accept": "ui-audit no confirmed; axe no violation; keyboard reachable; reflow@320 and text-scale@200 hold", "reject": "any confirmed a11y defect", "note": "not a WCAG conformance claim" },
    "performance": { "tier": "E0A+E0B", "accept": "bundle within budget; route-attribution plausible; perf-audit no confirmed", "reject": "a budget breach under a compatible profile", "note": "built/route-associated bytes only; lab not field" },
    "visual": { "tier": "E0A(mechanical)+E2(human)", "e0a_accept": "design-consistency no confirmed literal-vs-token; reduced-motion honored; the five data-view states present", "e2": "HUMAN_REVIEW_REQUIRED: hierarchy, composition, density, identity judged from the capture set; never auto-passed" }
  },
  "negative_control": "impl-quality/negatives/<id>-broken (a known-defect variant that must FAIL the named axis)",
  "human_review": { "capture_set": "verification/browser/evidence/...", "rubric": [ "is the hierarchy clear", "does identity read", "are empty/error/loading states designed, not default" ] }
}
```

## What this increment does NOT do

- It runs no agent and no model. Any axis that needs an app *generated by a model from the brief* is
  **E0B/E1 NOT_RUN** here; this increment prepares the contracts and validates them against the existing
  reference apps (which stand in for "a correct build") and the negative controls (a "defective build").
- It builds no fifth app and no new auditor. It reuses the five reference apps and their checks.
- It never emits a visual-quality PASS from an automated signal.
