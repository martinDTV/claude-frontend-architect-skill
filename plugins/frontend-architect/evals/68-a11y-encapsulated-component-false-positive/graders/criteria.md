---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Says neither option: the finding as stated is a false positive because a wrapper component that declares a label-like prop (`label`, `aria-label`, `title`, `legend`) encapsulates the labelling of the control it wraps; the question is whether `FormField` renders that label correctly, not whether each `UInput` needs its own attribute
- Explains that the plugin's static audit (`ui-audit.mjs`) does not report controls inside such a wrapper: they are counted in `summary.encapsulatedByComponent` instead of being emitted as `form-control-without-label`, precisely to avoid this false positive
- Says what remains to verify, once, at the wrapper: that `FormField` renders a `<label for>` that points at the control's `id` (or an `aria-labelledby` association) and not just visible text next to the input; this is checkable by reading `FormField.vue` or in a rendered page (browser mode / axe `label` rule); if the association is missing, the fix belongs in `FormField`, not in 180 call sites
- Notes that attribute pass-through (`v-bind="$attrs"`) is how the `id`/`for` association usually reaches the inner input and that a spread makes the element unverifiable for the static audit, which is one more reason the check happens at the wrapper
- Rejects adding a redundant `aria-label` to every input (it duplicates and then drifts from the visible label, so the accessible name no longer matches what sighted users see) and rejects disabling the rule globally (bare inputs elsewhere would go unnoticed)
- Says a static tool can at most mark this pattern as heuristic / review, never confirmed

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Tells the user to add `aria-label` to every `UInput`
- Tells the user to disable the rule globally
- Treats the finding as confirmed without reading or rendering `FormField`
- Claims the wrapper is accessible by construction without saying the `for`/`id` or `aria-labelledby` association still has to be verified
