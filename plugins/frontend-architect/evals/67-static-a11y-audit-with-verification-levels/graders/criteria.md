---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Separates three verification levels explicitly and assigns each problem to the right one: the `<img>` with no `alt` attribute is proven by the markup (static, confirmed: `img-missing-alt`); the `<input>` with only a placeholder and no `<label for>`, wrapping `<label>`, `aria-label` or `aria-labelledby` is proven by the markup (static, confirmed: `form-control-without-label`); the icon-only `<button>` whose only child is `<IconTrash />` is a review-level finding (`button-without-accessible-name` as heuristic) because the child component may render a name (an `aria-label`, an SVG `<title>`, visually hidden text) and has to be read before it is called confirmed
- Names `ui-audit.mjs` (static, read-only, works on the Vue templates without executing the project) as the tool that produces these findings, each with a `verification` field (`static`, `review` or `browser`), and `--rules a11y` as the relevant subset
- Says that `:alt="product.name"` is an improvement but not proof: a bound alt becomes `img-alt-dynamic` with `verification: browser` because the markup cannot show that the value is non-empty and meaningful; real accessible names, contrast and reading order likewise need a rendered page and human review
- Gives concrete fixes: a meaningful `alt` (or `alt=""` only if the image is truly decorative), a visible `<label for>`/`id` pair or wrapping `<label>` instead of the placeholder as the only label, and an `aria-label` or visually hidden text on the icon-only button with the icon marked `aria-hidden="true"`
- States that passing the static audit is not WCAG conformance
- If it suggests a browser pass (`browser-audit.mjs`), says it is opt-in, needs the user's authorization and a local or staging URL

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Calls the audit, or a clean run of it, WCAG conformance or "WCAG compliant"
- Reports the icon-only button as a confirmed defect without saying the child component has to be read first
- Treats `:alt="product.name"` as proof that the image is accessible
- Recommends running the browser mode without saying it needs explicit authorization
- Presents the placeholder as an acceptable label for the input
