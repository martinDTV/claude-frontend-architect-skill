# UI verification in 1.4: static audit, browser mode, trust boundary and limits

This document explains how the plugin verifies built screens, what each part can prove, which safety rules are enforced by code, and what remains for a human. The reference the skill loads on demand is `plugins/frontend-architect/skills/frontend-architect/references/ui-verification.md`; the flag-level catalogue is `scripts/README.md` (*Static UI audit*, *Browser mode*). The measurements quoted here come from the fixtures and tests in `verification/`, run on 2026-10-29 on the development machine (macOS, Node 22, Chromium 143 through Playwright 1.64.1, axe-core 4.14.0).

## Contents

1. Architecture: two modes, one trust boundary
2. Static mode: element extraction and verification levels
3. Accessibility: what is statically confirmed, heuristic, browser-only, unverifiable
4. Forms
5. Browser mode: safety model
6. Browser checks: axe, keyboard, dialogs, responsive, hydration, forms
7. Visual regression
8. SSR and hydration (static rules)
9. Evidence and privacy policy
10. Fixtures and tests
11. WCAG: what is not claimed, human-review criteria
12. Residual risks

## 1. Architecture

```
                 ┌──────────────── static mode (default) ────────────────┐
 project files → │ graph (lib/graph.mjs) → compiler-sfc / TypeScript AST │ → ui-audit.mjs, state-audit.mjs (SSR rules), routes-audit.mjs
                 │ read-only · no execution · no network · no writes     │
                 └───────────────────────────────────────────────────────┘
                 ┌──────────────── browser mode (opt-in) ────────────────┐
 a URL the user  │ browser-audit.mjs → Playwright (user's install)       │ → report + optional masked screenshots under --out
 names           │ allowlisted hosts · no login · budgets · masking      │
                 └───────────────────────────────────────────────────────┘
```

Static mode is the default and the only mode the skill or the agent runs on their own. It extends the 1.2/1.3 engine: `.vue` templates are already parsed with the project's `vue/compiler-sfc`, TypeScript and TSX with its `typescript`; 1.4 keeps, per element, the tag, attributes, bound attributes, events, directives, text, child tags and the chain of parents (document order), and per identifier its AST context (enclosing calls, enclosing function, `if`/ternary/`&&` guards). Rules read those records; nothing of the project executes. The trust boundary is unchanged from 1.2: with the semantic engine the tool loads `typescript` and `vue/compiler-sfc` from the audited project's `node_modules` (or from `--typescript`/`--vue-compiler`); `--engine lexical` loads nothing and degrades as described below.

Browser mode is a separate tool with its own trust boundary. It never starts a server, never installs anything, never builds. It drives a browser that the user provides (`--playwright <dir>`) against a URL the user names, and writes evidence only under `--out`. The static tools do not import it; a test asserts that no static script references `playwright`, `axe-core` or `browser-audit` and that the PNG codec depends on `node:zlib` only.

## 2. Static mode: element extraction and verification levels

| Source | Records | Parents | Used for |
|---|---|---|---|
| `vue/compiler-sfc` template AST | every element with `attrs`, `bound` (`:x`, `v-bind:x`, `v-model`), `events` (`@x`), `directives`, `hasText`, `hasSlot`, `childTags`, `parents`, `depth`, `isComponent` | yes | all rules |
| TypeScript JSX AST (`.tsx`, `.jsx`, `<script lang="tsx">`) | same shape; attribute values are strings, `true`, literal numbers, or `{expr}` (then treated as bound); `htmlFor`→`for`, `className`→`class`, `tabIndex`→`tabindex`, `onX`→ event `x` | yes | all rules |
| lexical fallback (template text, regex) | tags and attributes, no parent chain | no | facts provable from attributes alone stay `static`; anything that needs the tree degrades to `review`; JSX is not scanned |

Every finding of `ui-audit` carries `verification`:

- `static` → level **confirmed**: the markup proves the fact in this file.
- `review` → level **heuristic**: a pattern that deserves reading; the tool cannot see the rest (a child component, a shared directive, CSS).
- `browser` → level **info**: a bound attribute (`:alt`, `:aria-label`, `:id`) decides at render time.

Two counters keep the report honest: `encapsulatedByComponent` (controls whose nearest custom-component ancestor declares a label-like prop: `label`, `aria-label`, `ariaLabel`, `title`, `legend`, `name`, `placeholder-label`, static or bound) and `unverifiable` (elements carrying a spread). Both are counted and not reported.

## 3. Accessibility rules and their levels

| Finding | Condition | Level |
|---|---|---|
| `img-missing-alt` | `<img>` with no `alt` attribute, no `role="presentation|none"` | static |
| `img-alt-dynamic` | `:alt` bound | browser |
| `form-control-without-label` | `<input>` (not hidden/submit/button/reset/image, not HTML `hidden`), `<select>`, `<textarea>` with no wrapping `<label>`, no `<label for>` pointing at its `id`, no `aria-label`/`aria-labelledby`/`title` | static; browser when the name or id is bound, or when a class that usually means display:none (`hidden`, `d-none`, `display-none`, `is-hidden`) hides the control; review without parents (lexical) |
| `button-without-accessible-name` | `<button>` or `role="button"` with no text anywhere in its subtree (name from content) and no name attribute | static; review when a component anywhere inside may render the name; browser when bound |
| `link-without-href` | `<a>` handling click without `href`/`:href`/`:to` | static |
| `click-handler-on-non-interactive` | a real click handler (not `@click.stop` without expression, not a handler that only stops propagation or prevents default) on a non-interactive tag without an interactive role; with role but not focusable; focusable but without key handler; a handler that only focuses an inner control | static / static / review / review |
| `nested-interactive` | a focusable element inside `<a>` or `<button>` | static |
| `aria-hidden-on-focusable` | `aria-hidden="true"` on a focusable element | static |
| `invalid-role`, `unknown-aria-attribute` | not in the WAI-ARIA lists | static |
| `positive-tabindex` | `tabindex` > 0 (JSX numeric literals included) | static |
| `heading-level-skipped` | `h1 → h3` in document order inside one template | review |
| `iframe-without-title`, `image-input-without-alt`, `dialog-without-name` | the attribute is absent and not bound | static |
| `table-without-headers` | no `<th>` anywhere under the table | review |
| `mouse-only-handler` | `mouseover`/`mouseenter` without `focus`/`focusin` | review |

Measured on the `ui-app` fixture (ground truth written before the rules ran, 32 findings over five files after the calibration below): semantic engine precision 100%, recall 100%; `GoodForm.vue` (labels by `for`/`id` and by wrapping, `aria-label` buttons, decorative images, associated errors, pending state) and `pages/index.vue` produce nothing; `Wrapped.vue` yields one encapsulated control (not reported) and three `browser` findings for bound names. The lexical engine on the same fixture is measured in `docs/benchmarks.md` (lower precision by design: no parents, no JSX).

### Calibration on real code (read-only, 2026-10-29)

The fixture proves each rule once; real templates are where false positives live. The static audit was run, without writing anything, on the two projects used since 1.1 for calibration, and every `static` finding on the larger one was read:

| Project | Files with markup | Elements (native) | First rule set: static / review / browser | After calibration: static / review / browser | Encapsulated / unverifiable |
|---|---|---|---|---|---|
| Nuxt enterprise application (80k lines, Nuxt UI) | 210 (all AST) | 9,002 (6,507) | 52 / 32 / 28 | 15 / 12 / 33 | 11 / 12 |
| Medical SaaS (Nuxt 4) | 68 (all AST) | 1,338 (878) | 1 / 2 / 1 | 0 / 2 / 0 | 0 / 0 |

Reading the 52 static findings of the first run found four patterns the fixture did not contain, all false positives:

1. **Buttons named by nested text** (15 of 15 `button-without-accessible-name` static): `<button><span>…</span><span>Label</span></button>`. The first rule looked at direct text children only; accessible names come from any descendant text, so `hasText` and `childTags` are now collected through the subtree (a component anywhere inside makes the finding `review`).
2. **Click plumbing** (7 of 23 `click-handler-on-non-interactive`): `<div @click.stop>` with no expression, used to keep a row click from firing under an actions area. A handler with no expression, or one that only calls `stopPropagation()`/`preventDefault()`, is not an action and is no longer reported.
3. **Focus delegation** (1 of 23): `<div class="cursor-text" @click="input?.focus()">` around a text input. Now `review`, low: the inner control is what must be reachable.
4. **Hidden file inputs** (14 of 14 `form-control-without-label` static): `<input type="file" class="hidden" ref="…" @change="…">` opened by a visible button. A class cannot prove display:none, so the finding becomes a `browser` check with the explanation; the HTML `hidden` attribute skips the control.

The 15 static findings that remain are nine clickable table rows (`<tr @click>` without role, tabindex or key handler) and six clickable `<div>` cards and drop zones with the same gap; all were confirmed by reading. The medical SaaS keeps two `review` findings (forms with a submit handler whose pending flag is not visible in the component). The negative controls for the four patterns were added to the fixture (`GoodForm.vue`, `BadForm.vue:32`, `Wrapped.vue:15`, `Card.tsx`) and the truth updated (32 findings) before the 1.4.0 snapshots were frozen. What this does not show: recall on patterns neither the fixture nor these two code bases contain, and anything about component-library internals (components are not judged).

## 4. Forms

Static (`--rules forms`): `form-error-not-associated` (`aria-invalid` without `aria-describedby`/`aria-errormessage`), `form-without-pending-state` (a `<form @submit>` in a component with no identifier matching pending/loading/submitting/busy/inFlight/saving/disabled in its script bindings), `required-visual-only` (asterisk in the label text, control not `required`/`aria-required`). The pending-state rule distinguishes where the flag lives: a local ref or prop (visible, rule silent), a store or mutation state imported into the component (`isPending`, visible, rule silent), or nothing visible (reported as review: "no pending-like identifier found in this component"; the browser check decides).

Browser (`--checks forms --allow-submit`): the tool records the status regions, submits each form empty (validation feedback, association, focus to the first invalid field), then fills text controls with `Audit value`, checks and selects what is required, double-clicks submit and counts the requests that leave the page (`form-double-submit`, confirmed when two or more), observes the submit button during the request (`form-no-pending-state`) and compares status regions and URL afterwards (`form-no-success-feedback`).

Not covered in 1.4 (documented, not claimed): navigation away with unsaved data, late responses after a tenant or session change, sensitive data retained after logout, and server-side idempotency. They need scenarios scripted per product; the references name the test shapes.

## 5. Browser mode: safety model

Every rule below is enforced in `browser-audit.mjs` and exercised by `verification/browser/browser-audit.test.mjs`:

| Rule | Enforcement | Test |
|---|---|---|
| No execution without explicit tooling | `--playwright <dir>` is mandatory; exit 2 otherwise; nothing is installed or downloaded | refusal test |
| Only authorised hosts | `localhost` and `127.0.0.1` by default; other hosts need `--allow-host`; every request to another host is blocked by `context.route` and listed in `data.blockedRequests` | refusal test (`https://example.com/` → exit 2) |
| Never production by default | no production heuristics are needed: the allowlist starts at localhost and the documentation never suggests a production host | documentation |
| No automatic authentication | no cookies, storage state or credentials are accepted; a login wall is `auth-required` and the page is skipped; a form with a password field is never submitted (`form-skipped-credentials`) | fixture `login.html`: the counting server records zero submissions for the login form while the defective form is submitted |
| No destructive interaction | `--interact` clicks `type="button"` controls whose name does not match the destructive list (delete, remove, destroy, pay, purchase, buy, send, submit, confirm, archive, publish, reset, revoke, logout, Spanish equivalents); forms are submitted only with `--allow-submit` | refusal test (`--checks forms` without `--allow-submit` → exit 2) |
| Budgets | `--max-time` (90 s) and `--max-pages` (10); pages left are listed in a note | fixture run within budget; note path by code review |
| Controlled output paths | `--out` and `--baseline-dir` must resolve (symlinks followed, whole path segments) under the working directory, the OS temp dir or `/tmp`; default `--out` is a fresh temp directory; the baseline directory is created only when a baseline is written | refusal tests (`--out /etc/…`, `--baseline-dir /etc/…`, a sibling directory sharing the cwd prefix → exit 2) |
| Masking | `--mask` selectors (defaults `input[type=password]`, `[data-sensitive]`, `[data-fa-mask]`) are blacked out in screenshots; their text, value, label, title and placeholder are collected per page and replaced by `[masked]` in every message, evidence string, page title and console line | fixture page carries a `[data-sensitive]` card number and a masked unreachable button; the test asserts both texts are absent and `[masked]` is present |
| No production writes | the tool writes under `--out` and, only with `--write-baseline`/`--approve`, under `--baseline-dir` | visual test: no baseline is written without the flag |

What is **not** guaranteed, and said so: a page's own scripts run in the browser as they would for any visitor, so a GET that mutates state server-side would be triggered by visiting it (do not point the tool at such URLs); the tool cannot know whether a staging database is shared; the allowlist blocks third-party requests, which may change how a page renders.

## 6. Browser checks

- **axe** (`axe-core` injected from the user's installation): violations of impact `critical` and `serious` are `axe-<rule>` confirmed, others `axe-needs-review`; incomplete results are not findings.
- **keyboard**: Tab through the page (up to 80 presses) and compare with the visible focusable elements (`keyboard-unreachable`, heuristic); scan the page's stylesheets for `:hover` rules that change `display`/`visibility`/`opacity` of a descendant and have no `:focus`/`:focus-within` counterpart, only when the base selector matches an element of the page (`hover-only-disclosure`, heuristic).
- **dialogs**: triggers are buttons with `aria-haspopup`/`aria-controls` and, with `--interact`, any non-destructive button; after a click the tool checks whether a `<dialog>`/`role="dialog"`/`aria-modal` opened (else a fixed overlay → `custom-modal-without-dialog-role`), whether focus moved inside (`dialog-focus-not-moved`, confirmed), whether Escape closes it (`dialog-escape-does-not-close`, heuristic) and whether focus returns to the opener (`dialog-focus-not-restored`, confirmed).
- **responsive**: for each viewport (mobile 375×812, tablet 834×1112, desktop 1280×800) and text scale (1, 1.25 via root font-size): horizontal overflow with culprits outside intentional scrollers (`overflow-x: auto|scroll` ancestors or `data-allow-overflow`), controls extending past the viewport, controls covered at their centre by another element when scrolled into view (`elementFromPoint`), dialogs taller than the viewport, navigation hidden without a disclosure button.
- **hydration**: console messages that the framework prints on hydration problems (`hydration-mismatch`, confirmed) and a text comparison of the server HTML (fetched once, scripts/styles/noscript/template removed) with the hydrated DOM (`client-only-rendered-content`, info, five or more words only on the client).
- **forms**: section 4.

Measured on the fixture (six pages, three viewports, two text scales, `--interact --allow-submit --screenshots`): 27 findings in about 25 s; every `mustHave` of `expected-browser.json` present, every `mustNotHave` absent on the correct pages (`form-good.html`, `dialog-good.html`), the intentional scroller never a culprit, the masked card number absent from the report, 18 screenshots under `--out`. One expectation was corrected during validation and recorded with its reason: axe's `label` rule accepts a non-empty `placeholder` as a name, so the bad form page is not an axe `label` violation (the static audit and the forms check still report it).

## 7. Visual regression

- One baseline per page and viewport: `<name>.png` and `<name>.json` with browser name, version and platform, Node and Playwright versions, viewport, device scale factor, reduced-motion and animation settings and the generation time.
- Determinism: `prefers-reduced-motion: reduce` emulated, `animations: 'disabled'` in the screenshot, `document.fonts.ready` awaited, `--freeze-time <iso>` freezes `Date` in the page. The data behind the page is not the tool's business: seeded fixtures are the user's responsibility.
- Governance: no baseline is written unless `--write-baseline` (and only when none exists) or `--approve page@viewport` names it. A missing baseline saves a candidate under `--out/candidates` and reports `visual-baseline-missing`. A baseline whose browser name, major version, platform or viewport differs from the run is `environment-mismatch`: no regression verdict.
- Comparison: zero-dependency PNG decoding (`lib/png.mjs`, 8-bit RGB/RGBA, filters 0–4), per-pixel channel threshold 32, differing-pixel ratio against `--visual-threshold` (0.001), regions as bounding boxes on a 16 px grid. Above the threshold `visual-regression` (confirmed) with the largest region; below it `visual-difference-accepted`. A size change is a regression.
- Test: baseline missing → nothing written; `--write-baseline` → one PNG; identical run → `match`; run without freeze on a page with no time-dependent content → `match`; altered platform in the metadata → `environment-mismatch` and no `visual-regression`.

## 8. SSR and hydration: static rules

`state-audit` gains two rules built on the identifier context of the semantic engine:

- `browser-api-in-setup`: a browser global (`window`, `document`, `localStorage`, `sessionStorage`, `navigator`, `location`, `history`, `screen`, `matchMedia`, `requestAnimationFrame`, the observers, `customElements`, `indexedDB`, `Notification`) read at the top level of `<script setup>`, in a Nuxt `setup()`, or in module scope of a `.ts`/`.js` file is **confirmed, high** with SSR on; in the render body of a React component it is **heuristic, medium**; with `ssr: false` it is **low** (it blocks enabling SSR). Skipped when the use is inside `onMounted`, `onBeforeMount`, `onBeforeUnmount`, `onUnmounted`, `onActivated`, `useEffect`, `useLayoutEffect`, `watch`/`watchEffect` callbacks, event handlers, `nextTick`, under `import.meta.client`, `process.client`, `typeof window !== 'undefined'`, `isClient`, `onNuxtReady`, or in `.client.` files. `'use client'` is not a guard.
- `nondeterministic-render`: `Date.now()`, `Math.random()`, `crypto.randomUUID()`, `performance.now()`, `new Date()` evaluated during render (heuristic).
- The lexical engine never emits them (no context).

Measured: the `ssr-app` fixture (truth of 5 findings: two reads at the top of `<script setup>`, one in module scope of a composable, two random values in a render; safe mounted, guarded, deferred handler, `.client.vue`, safe composable and page as negative controls) matches exactly; on the Next.js fixture only `WindowInRender.tsx` is reported (heuristic) and `WindowInEffect.tsx` is clean; the `ssr: false` copy reports the same places at low severity.

## 9. Evidence and privacy policy

- Static mode produces no evidence beyond file paths, line numbers and short code fragments already in the project.
- Browser mode writes `browser-audit.json` and, only with `--screenshots`, PNGs under `--out`. Screenshots are full-page, masked (`--mask`), at each viewport and scale. Evidence strings in findings are selectors, rule ids, request paths and counts; values typed into forms and text of masked elements are never included. The report records the allowed hosts, the checks, the budgets and the output directory so a reader knows what ran.
- Where to keep evidence: under the working directory or `/tmp` of the machine that ran it; screenshots of real user data must not be attached to tickets or chats. The fixture carries a fake card number specifically so the test proves it never leaks.

## 10. Fixtures and tests

| Fixture | Purpose |
|---|---|
| `verification/tools/fixtures/ui-app` (Nuxt) | `BadForm.vue` (24 static/review defects incl. a focus-delegation wrapper), `GoodForm.vue` (clean, with the calibration negative controls), `Wrapped.vue` (encapsulation, bound names, a hidden file input), `ui/Card.tsx` (JSX rules, nested text, stopPropagation plumbing), `expected-findings.json` written before the rules ran and extended with the calibration cases |
| `verification/tools/fixtures/ssr-app` (Nuxt) | unsafe and safe browser-API uses, random render, `.client.vue`, module-scope composable, `expected-ssr.json` |
| `verification/tools/fixtures/next-app` additions | `WindowInRender.tsx` (reported), `WindowInEffect.tsx` (clean) |
| `verification/tools/fixtures/nuxt-app` additions | `settings/index.vue` (middleware array with comments), `legacy/*.vue` (redirect pages), `middleware/step-up.ts` |
| `verification/browser/fixture` (static HTML + tiny server) | `index.html` (hover-only menu, img without alt, low contrast, masked card number, masked unreachable button), `form-good.html`, `form-bad.html`, `login.html` (credential form that must never be submitted), `dialog-good.html`, `dialog-bad.html`, `responsive.html` (intentional scroller, wide table, fixed bar covering Save), `expected-browser.json` |

Suites: `verification/tools/ui-audit.test.mjs` (truth equality, JSX, `--rules`, lexical degradation, clean component), `ssr-rules.test.mjs`, `routes-audit.test.mjs` (comments, redirects, positive controls), `baseline-findings.test.mjs` and `compat.test.mjs` (1.3 findings and JSON shapes frozen), `read-only.test.mjs` (static scan incl. the browser exception, byte-identical project after every static tool incl. `ui-audit`), `verification/browser/browser-audit.test.mjs` (refusals, fixture truth, visual lifecycle; skips with the reason when Playwright or Chromium are missing, fails instead of skipping with `FA_REQUIRE_BROWSER=1`, which CI and `run-all.sh` set). The browser dependencies are pinned in `verification/browser/package.json` and installed by CI (`npm ci`, `npx playwright install --with-deps chromium`); the plugin itself ships none of them.

The fixture server (`verification/browser/fixture/server.mjs`) binds 127.0.0.1 on a free port, serves the static pages and counts `POST /api/submit` per form so the double-submit finding is proven by the server, not inferred. The Nuxt fixtures are for static analysis and are not built or served by the tests; the browser-runnable example is the static fixture, which is what the brief allows without installs or servers in audited projects.

## 11. WCAG: what is not claimed

Neither tool, nor axe-core, nor both together establish conformance with WCAG 2.x at any level. The checks cover a subset of the testable success criteria (names and roles, some ARIA validity, contrast as computed by axe, focus movement, keyboard reachability for simple widgets, viewport reflow symptoms). The following need a person with the product in front of them: meaningful reading order and heading narrative; whether text alternatives, captions and transcripts carry the meaning; timing, session expiry and the ability to pause motion; cognitive load, plain language, error prevention for legal and financial actions; consistent navigation and identification across pages; keyboard operation of custom widgets end to end; screen-reader announcements in context; colour meaning in charts; embedded documents. The skill, the agent and the tool notes say "no finding at this level; these criteria were not reviewed", never "accessible" or "WCAG AA".

## 12. Residual risks

- The static rules know the HTML elements, not the project's component library: a `<UButton icon="…" aria-label="…">` is a component and is never judged; an unlabelled `<UInput>` without a label-like prop on an ancestor is not reported either (components are out of scope by design). The browser pass is where component libraries are judged.
- Encapsulation is decided by prop names; a wrapper that declares `label` and never renders it defeats the rule. The reference tells the reviewer to read the wrapper or run the browser pass.
- `form-without-pending-state` is a name-based heuristic (`review`); a project that calls its flag `working` will be asked to verify.
- Hover-only detection reads same-origin stylesheets only; cross-origin CSS is skipped (CORS), so a hover-only menu styled from a CDN is missed.
- Hydration detection depends on the framework logging a warning; production builds of Vue strip hydration warnings, so run against a dev or preview server with warnings enabled.
- Visual comparison is pixel-based; anti-aliasing differences inside the same environment are below the default threshold on the fixture, not proven for every font stack.
- Browser mode runs the page's own JavaScript: pages whose GET requests mutate server state should not be audited.
- Evidence strings quote accessible names and selectors (truncated); names of unmasked controls can carry user content on pages that display personal data. Mask them (`--mask`) or audit seeded test data.
- The fixtures are synthetic and sector-neutral (a generic back office with sales, projects, documents and people; a profile form; an e-commerce order feature). The calibration projects are external evidence only: nothing in the plugin reads, names or depends on them.
- The type-checker budgets measured on two real projects (`docs/benchmarks.md`) are local measurements; a synchronous `Program` cannot be interrupted, so the heap budget is applied after creation and the results are discarded when exceeded.
