# UI verification: static audit, browser mode and what still needs a person

Two tools verify built screens. `scripts/ui-audit.mjs` reads markup and proves little, honestly. `scripts/browser-audit.mjs` drives a real browser and observes behaviour, only when the user authorises it. Neither replaces a human review, and neither result is "WCAG conformance". Use this file when the task is to verify accessibility, forms, responsive behaviour, visual regressions or hydration of screens that already exist; for building them, `accessibility.md`, `forms.md` and the `creative-frontend` skill's `layout-and-responsive.md` hold the criteria.

## What each level can prove

| Level | Source | Proves | Cannot prove |
|---|---|---|---|
| **static** (`ui-audit`, `verification: static`, level confirmed) | Template or JSX AST | An attribute is absent or literally wrong in this file: `<img>` without `alt`, an input with no label of any kind, `role="buton"`, `tabindex="3"`, a `<div @click>` with no role, a button nested in a link, `aria-hidden` on a focusable | Anything decided at render time: bound values, computed ids, slots, CSS, focus, contrast |
| **review** (`verification: review`, level heuristic) | Same AST, incomplete evidence | A pattern worth reading: an icon-only button whose child component may render a name, a heading jump, a table without `<th>`, a form with a submit handler and no pending-like identifier, `aria-invalid` without `aria-describedby` | Whether the pattern is a defect in this product |
| **browser** (`ui-audit` info, or `browser-audit` findings) | Rendered page | Accessible names as computed, axe-core rules, Tab order, focus movement in dialogs, requests sent on double click, overflow at a viewport, pixels against a baseline | Meaning, reading order, timing, cognitive criteria |
| **human** | Eyes and assistive technology | Everything in the last column | |

## Static audit

```bash
node ${CLAUDE_SKILL_DIR}/scripts/ui-audit.mjs <root> --md            # a11y and forms rules
node ${CLAUDE_SKILL_DIR}/scripts/ui-audit.mjs <root> --rules forms --json
```

Reading the report:

- `summary.byVerification` splits static / review / browser. Report `static` findings as defects with `path:line`; read the component before reporting a `review` finding; list `browser` findings as "needs a rendered check", never as defects.
- `encapsulatedByComponent` counts controls inside a custom component that declares `label`, `aria-label`, `title`, `legend` or `name` (static or bound). They are not reported: the wrapper owns the labelling. What remains to verify, by reading the wrapper or in the browser, is that it really renders `<label for>` or `aria-labelledby`. Do not ask the user to add redundant `aria-label`s to every wrapped input.
- `unverifiable` counts elements with a spread (`v-bind="$attrs"`, `{...props}`): the attributes are decided elsewhere; say so instead of guessing.
- `data.files[].source` is `ast` or `lexical`. Under the lexical engine (no element tree) wrapping labels and nesting cannot be checked, findings that need them degrade to `review`, and JSX is not scanned; quote the engine when the project forced it.
- The rule catalogue with the exact conditions is in `scripts/README.md` (*Static UI audit*).

Typical false positives and the rule that avoids them: a decorative `<img alt="">` or `role="presentation"` is fine; `<input type="hidden|submit|button|reset|image">` is not a labelled control (`image` needs `alt`); a button whose text sits in a nested `<span>` has a name (name from content); `@click.stop` with no handler, or a handler that only stops propagation, is plumbing and is not interactive; a wrapper whose click only focuses an inner control is `review`; a control hidden by a display:none class (`hidden`, `d-none`) without a label is a `browser` check, and one with the HTML `hidden` attribute is skipped; `<a>` without `href` is only flagged when it handles click; a focusable element with `role` from the interactive set and `tabindex` is not "click on non-interactive" (only its missing key handler is `review`).

## Browser mode

Propose it when the question is behavioural (focus, keyboard, double submit, overflow, hydration, visual drift) and a local or staging URL exists. Never run it on your own initiative; the authorisation checklist is the user's answer to:

1. **Which URL**: a local dev server or a staging host they name (`--allow-host` for anything that is not localhost). Production is never a default; if they insist, they say so and accept that the tool never logs in, never submits a form that contains a password field, and that `--allow-submit` is off.
2. **Which browser installation**: a directory with `playwright` and `axe-core` in its `node_modules` (`--playwright <dir>`). The plugin installs nothing. `verification/browser/package.json` in the repository pins the versions the fixture was validated with.
3. **Which interactions**: `--interact` (clicks non-destructive buttons to discover dialogs and menus; names matching delete, remove, pay, send, submit, confirm, archive, publish, reset, revoke, logout and their Spanish equivalents are never clicked), `--allow-submit` (fills and submits forms with marked audit values; only where test submissions are acceptable).
4. **Where evidence goes**: `--out` (and `--baseline-dir`) under the working directory or `/tmp`; `--screenshots` only if they accept image evidence; `--mask` for anything sensitive beyond the defaults (`input[type=password]`, `[data-sensitive]`, `[data-fa-mask]`). Masking is not anonymisation: masked text becomes `[masked]`, but accessible names of other controls, text quoted by axe-core, ids in selectors, URLs and titles can still carry user content. On pages with personal or clinical data use seeded accounts, mask the containers, keep screenshots off, and never paste evidence of real users into a chat or a ticket. The tool stores no credentials or cookies.
5. **Budget**: `--max-time` (90 s) and `--max-pages` (10); a budget that runs out is noted, never hidden.

```bash
B=/path/with/node_modules/playwright            # the user's installation
node $S/browser-audit.mjs http://localhost:3000 --playwright $B --paths /,/orders,/settings --out /tmp/fa-browser --md
node $S/browser-audit.mjs http://localhost:3000 --playwright $B --paths /checkout --checks forms --allow-submit --out /tmp/fa-browser --md
node $S/browser-audit.mjs http://localhost:3000 --playwright $B --checks responsive --viewports mobile,tablet,desktop --text-scale 1,1.25 --screenshots --out /tmp/fa-browser
node $S/browser-audit.mjs http://localhost:3000 --playwright $B --checks visual --baseline-dir ./visual-baselines --freeze-time 2026-01-01T00:00:00Z
```

Reading the findings: `confirmed` was observed in the page (an axe violation of a WCAG-tagged rule with impact critical or serious whose exceptions axe evaluates, two requests after a double click, focus left outside an open dialog, a control covered by a fixed bar at a viewport); `heuristic` was observed but context may justify it (an axe best-practice rule such as `region`, `axe-target-size` because SC 2.5.8 has exceptions axe cannot see, a hover-only menu with a keyboard alternative elsewhere, a custom overlay that is in fact a toast); `info` is evidence (`auth-required`, `client-only-rendered-content`, `axe-needs-review`, baseline bookkeeping). Every axe finding carries `basis` (`wcag` or `best-practice`), `criteria` (`1.4.3`) and `impact`: quote the criterion, never the impact alone, and never present a best-practice finding as a WCAG failure. Every responsive finding names the viewport and text scale. `data.blockedRequests` lists third-party requests the allowlist stopped; a page that needed them may look broken, say so.

Contrast coverage (1.4.1): before quoting "no contrast violation", read `checks.axe.coverage` of the page (or `summary.axeCoverage`). axe-core skips every text element that a root `overflow: hidden` with a 0 px or non-overlapping box hides from it (fixed app shells, modal scroll locks): `axe-coverage-gap` says how many were skipped and whether the second pass, which neutralises the lock temporarily and restores the page, found violations (`axe-color-contrast` with `pass: 2`; heuristic when `axe-recovery-not-comparable` reports that the layout moved). `axe-no-evaluable-content` means there was nothing to evaluate. Report the recovered findings as contrast defects with the note that they come from the second pass, and report the gap itself as a defect of the page (root height or `overflow: clip`), because every other tool that runs axe on that page will be blind in the same way.

## Forms: where each concern is verified

| Concern | Static (`ui-audit`) | Browser (`browser-audit --checks forms --allow-submit`) | Human |
|---|---|---|---|
| Duplicate submissions | `form-without-pending-state` (review: no pending-like identifier in the component) | `form-double-submit` (confirmed: the second request left before the first response; heuristic: two sequential submissions because the first finished first) | idempotency of the endpoint |
| Missing loading state | same review finding | `form-no-pending-state` (button neither disabled nor `aria-busy` while in flight) | whether the feedback is understandable |
| Errors not associated | `form-error-not-associated` (`aria-invalid` without `aria-describedby`/`aria-errormessage`) | `form-error-not-associated`, `form-no-validation-feedback` after an empty submit | wording of the message |
| Focus lost on error | | `form-focus-not-moved-to-error` | |
| Required fields | `required-visual-only` (asterisk without `required`) | axe `label`/`aria-required` rules | |
| Success without confirmation | | `form-no-success-feedback` (no status region changed, no navigation) | |
| Dialogs not restoring focus | `dialog-without-name` (static) | `dialog-focus-not-moved`, `dialog-escape-does-not-close`, `dialog-focus-not-restored`, `custom-modal-without-dialog-role` | |
| Navigation with unsaved data, late responses after a tenant or session change, sensitive data kept after logout | not provable from markup | not implemented in 1.4 (needs scripted scenarios per product) | review against `realtime-and-sync.md` (identity epochs, stale responses) and `auth-session-tenant.md` (logout protocol); `testing-scenarios.md` has the test shapes |

State of the pending flag: when the component owns it (local ref or a prop), the static finding is about this file; when it comes from a store or a query mutation (`isPending` from Pinia Colada or TanStack Query), the identifier is visible and the rule stays silent; when nothing is visible, the rule says "no pending-like identifier found in this component" and the browser check decides.

## Responsive and visual

- Matrix: mobile (375), tablet (768) and desktop (1280) viewports at text scale 1 and 1.25 by default (`--viewports`, `--text-scale`). Report defects per cell. For WCAG 2.2 questions add `reflow` (320 px, SC 1.4.10: `horizontal-overflow` there names the criterion and stays heuristic when only data tables, images, diagrams or toolbars overflow, which the criterion excepts) and `--text-scale 1,2` (SC 1.4.4). Custom widths are `WIDTHxHEIGHT` tokens (`390x844`). The text scale changes the root font-size: `textScaleApplied` in each cell says what share of the text followed; `text-scale-not-applied` means the page sizes text in px and the scale proved nothing, so test with browser zoom; `text-clipped-at-scale` names boxes that cut text off at the scale. None of this is a 1.4.4 verdict on its own.
- Target size (SC 2.5.8, 24×24 CSS px): `axe-target-size` per viewport is a lead, not a confirmed failure, because the equivalent-control, essential and user-agent exceptions need a person; `checks['targets:<viewport>']` keeps the raw counts under 24 px and under 44 px apart (44 is the AAA and platform recommendation, not the AA minimum). Do not ask for 44 px as a WCAG requirement.
- Landmarks: `axe-region` is a best practice (heuristic/low), one finding per page or per shell (`scope: shell`, `pages`); name the layout, not every route.
- Intentional horizontal scroll is not a defect: an element inside an `overflow-x: auto|scroll` ancestor, or marked `data-allow-overflow`, is never an overflow culprit; the finding names the elements that really widen the page. A wide data table in a labelled scroll region is the correct pattern on narrow screens; a fixed bottom bar covering the primary action at 125% is a defect (`control-covered`).
- Visual regression: one approved baseline per page and viewport with browser, version, platform, Node and Playwright versions, viewport and device scale factor recorded. Baselines are written only with `--write-baseline` (when none exists) or `--approve page@viewport`; the tool never updates an approved baseline because a build was green. A baseline from another browser, version, platform or viewport yields `visual-environment-mismatch` and no verdict. Determinism: animations disabled, fonts awaited, `prefers-reduced-motion: reduce`, `--freeze-time`; the data behind the page is the user's responsibility (fixtures, seeded accounts). Differences above the threshold are `visual-regression` with regions; approve only intended changes, by name.

## SSR and hydration

- Static: `state-audit` reports `browser-api-in-setup` (confirmed at the top level of `<script setup>` or in module scope with SSR on; heuristic in a React render body; low severity when `ssr: false`) and `nondeterministic-render` (heuristic: `Date.now()`, `Math.random()`, `new Date()`, `crypto.randomUUID()` feeding the render). Not a hazard, and not reported: uses inside `onMounted`/`onBeforeMount`/`useEffect`/`useLayoutEffect`/event handlers, under `import.meta.client`, `process.client` or `typeof window !== 'undefined'`, and `.client.vue`/`.client.ts` files. `'use client'` is not a guard: client components still render on the server.
- Browser: `hydration-mismatch` (the framework logged a hydration problem) and `client-only-rendered-content` (words present only after client rendering). Cross-request state leaks are not observable from one browser; `ssr-test/` in the repository shows the concurrent-request test shape, and `state-audit` reports module-level state in server-executed code.

## What no tool verifies (say it in the report)

Reading order and heading structure as a narrative; whether alternatives (`alt`, captions, transcripts) carry the meaning; timing and session limits; motion that can be paused; cognitive load, error prevention and plain language; consistent navigation and identification across pages; keyboard operation of custom widgets end to end; screen-reader announcements in context; colour meaning in charts and status beyond contrast ratios; PDF and other embedded documents. Write "no static or axe-core finding; the criteria above were not reviewed" rather than "accessible" or "WCAG AA".

## Report shape

Group by nature so nobody mixes them: architecture failures; accessibility failures (static-confirmed, with `path:line`; browser-confirmed, with page, viewport and rule); confirmed visual or behavioural defects (browser mode, with the evidence string); heuristics to verify (`review` findings, heuristic browser findings); design recommendations (density, hierarchy, tokens), which are opinions. State the mode that ran (static only, or browser with its flags and URL), the engine, the budget, and what was masked.
