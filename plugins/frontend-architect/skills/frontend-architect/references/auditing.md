# Auditing an existing frontend

A method for answering questions such as "should we split this app", "what should we fix first" or "is this safe to scale", with evidence that survives a second reader. The `frontend-reviewer` agent follows this method; the scripts in `scripts/` (documented in `scripts/README.md`) produce the measurements. The report shape is `assets/audit-report-template.md`.

## Contents
- Scope and rules
- Evidence tiers
- Inventory
- Tool sequence
- Reading the tool output
- Stage assessment
- Ranking problems
- Comparing alternatives
- The report
- Time budget and delivery checklist
- What an audit must not do

## Scope and rules

- **Read-only.** No edits, no installs, no builds unless the user asked for bundle numbers and the project's own build command is safe to run; no git state changes. Measurements come from existing artifacts or from the project's own scripts (`typecheck`, `lint`, `test`).
- **Question first.** Write the question the audit answers in one sentence (for example "microfrontends or modular monolith?") and the short answer in the summary. Everything else supports that answer.
- **Versions from disk**, never from memory: `node_modules/<pkg>/package.json`, the lockfile, `nuxt.config.*`/`next.config.*`, Node and package manager from `packageManager`/`.nvmrc`.
- **Respect the product.** Conventions that are consistent and working are not findings. An audit that recommends rewriting what works is not read twice.

## Evidence tiers

Every statement in the report carries one tier and never mixes them:

| Tier | Meaning | Form |
|---|---|---|
| **Demonstrated** | Present in the code at a location | `path:line` plus a one-line quote or description |
| **Measured** | Produced by a command or tool that anyone can re-run | The command, its output (numbers), the date and the environment |
| **Hypothetical** | A risk that would materialize under a condition that does not hold today | The condition stated explicitly ("if SSR were enabled", "if two tenants shared an origin") |

Tool findings map to tiers: `confirmed` → demonstrated once you have read the location; `heuristic` → hypothetical until you confirm it by reading; summaries and sizes → measured. A heuristic you did not verify stays out of the "problems" table.

## Inventory

Collect before judging (one table per block in the report):

1. **Platform**: framework and exact versions, rendering mode (`ssr`, `routeRules`, `output`), TypeScript strictness, package manager, Node.
2. **Size and shape**: files and lines per top-level folder (`wc -l`), largest files, number of routes, components, composables/hooks, stores.
3. **Routes and navigation**: `routes-audit.mjs` (pages, guards, layouts, Server Actions, handlers), how menus are built, URL state.
4. **Identity, session, tenant, permissions**: session model, where tokens live, refresh logic, logout protocol, tenant resolution, permission source (`auth-session-tenant.md`).
5. **API layer**: HTTP clients (how many instances), services, validation at the boundary, cancellation, error contract.
6. **State**: `state-audit.mjs` (stores and who uses them, `useState` keys, module-level state, storage writes).
7. **UI**: component library and version, hand-written tables/forms/dialogs count, five states coverage, accessibility signals.
8. **Build, tests, delivery**: scripts, CI steps, test counts by layer, deploy paths (how many), configuration strategy, bundle (`bundle-budget.mjs` when a build exists).
9. **Organization**: `git shortlog -sn -- <dir>` per area, `CODEOWNERS`, release cadence from merged PRs, teams. Microfrontends are an organizational decision; this block decides it.

## Tool sequence

With `S` pointing at the skill's `scripts/` directory and the project root as the current directory:

| Step | Command | Output used for |
|---|---|---|
| 1 | `node $S/domain-deps.mjs . --suggest-config` | A starter classification; group folders into business domains **by hand** (pages, components and the composables that serve them belong together). Save it outside the project (for example `/tmp/<app>.frontend-audit.json`) or ask the owner to commit `.frontend-audit.json` |
| 2 | `node $S/domain-deps.mjs . --config <file> --md` | Matrix, horizontal coupling, hotspots, shell→domain, shared→domain, cycles; `--edges a:b` to list a pair |
| 3 | `node $S/component-complexity.mjs . --top 25 --md` | Which files to read first; oversized and mixed-responsibility candidates |
| 4 | `node $S/state-audit.mjs . --config <file> --md` | Stores by consumer domains, server data in stores, tokens in storage, module-level state, logout coverage |
| 5 | `node $S/routes-audit.mjs . --config <file> --md` | Unguarded pages, literal role checks, `'use client'` too high, Server Actions without checks |
| 6 | `node $S/leak-patterns.mjs . --md` | Resources without cleanup, by file |
| 7 | `node $S/contracts-check.mjs . --md` | Module entries, internal imports, implicit (auto-import) dependencies, cycles; `--write-baseline` for later diffs |
| 8 | `node $S/bundle-budget.mjs . --md` | Startup and chunk sizes, only when a production build exists |
| 9 | Project's own `typecheck`, `lint`, `test` | Measured quality signals (report real results, including "no tests") |
| 10 | `frontend-reviewer` agent | An independent pass; reconcile its findings with yours and keep the union with tiers |

Run 2–7 in under a minute on a 100k-line app. They parse the code with the project's own TypeScript and `vue/compiler-sfc` when installed (the `Analysis` line of each report says `engine: semantic`, with the compiler version and the `tsconfig` used) and fall back to lexical analysis otherwise; they never execute project code. Quote the engine and an edge's `resolution` when a finding rests on a dependency, and treat *Unresolved imports* as unknowns rather than as absence of coupling (`scripts/README.md`, section "Analysis engine").

## Reading the tool output

| Tool | Read it as | Typical false positives |
|---|---|---|
| `domain-deps` | The diagonal is cohesion; the `shared` column is normal; bold cells are horizontal coupling to explain one by one (misnamed core module, legitimate business dependency, accident). `shell-depends-on-domain` on `auth`/`organizations` is usually legitimate: add them to `coreDomains` | Without a config, each folder is a domain and the matrix fragments; identifiers shared with local variables of the same name; type-only imports counted as coupling (filter `typeOnly` in `--json`) |
| `component-complexity` | A reading order, not a verdict; a 900-line page that only composes is fine, a 300-line one that fetches, validates and renders three modals is not | Generated code, long static templates (legal text), chart configuration objects |
| `state-audit` | `module-level-*` is critical with SSR on and a future blocker with `ssr: false`; `token-in-web-storage` is a decision the product made, say when and why it must change | Test doubles and dev-only adapters (downgraded, still listed); `let` for lazy singletons of immutable config |
| `routes-audit` | `unguarded` means "no declared guard", not "exposed data"; check the backend | Public marketing pages inside the app folder; guards applied by a layout instead of `definePageMeta` |
| `leak-patterns` | Candidates to open; the "no unmount hook at all" variant is the strong signal | Cleanup in a parent, a VueUse helper the tool does not know, listeners added once at app start on purpose |
| `contracts-check` | `internal-import` is demonstrated; `implicit-cross-module-dependency` is the Nuxt-specific coupling that import rules cannot see | Modules that are really shared UI folders (use `--modules-dir` deliberately) |
| `bundle-budget` | Startup size against the budget; the largest chunks against expectations (lazy or not) | Builds from a different commit or environment; hash-only names hide what a chunk is (confirm with the framework analyzer) |

## Stage assessment

Classify the project (stages in `architecture.md`) and name the gap:

| Observed | Stage | Typical next step |
|---|---|---|
| Framework defaults, no business folders | 0 | Fine for its size; watch the triggers to move to 1 |
| Code grouped by domain folders, flat auto-imported composables, no public entries, no boundary rules | **1.5** | Make boundaries explicit (module entries, explicit imports, dependency-cruiser) before any split |
| Feature modules with entries and enforced rules | 1 | Layer only the complex features (stage 2) |
| Several deployables sharing real code | 3 | Monorepo with contracts and tokens; each app stays stage 1 |
| Separate apps per team with independent deploys | 4 | Verify the prerequisites still hold (`microfrontends.md`) |

"1.5" is the most common state in enterprise Nuxt apps: the code looks modular but any screen can use any client because auto-imports hide the dependency. The fix is cheap inside one app and expensive after a split.

## Ranking problems

Score each demonstrated problem on **impact** (security or data leak, correctness, cost of change, user-visible performance) and **effort** (hours, days, weeks, with or without a test net), then order by impact descending and effort ascending. The first three items of the report are the best ratio, not the biggest problems. Always list the problems that any option must fix first (boundaries, tests around the session core, a single deploy path) separately from the problems that only matter under one option.

Separate what is **good and must not change**: a compact session core, consistent error contracts, URL-driven navigation state, a working pipeline. Readers trust an audit that names strengths with the same precision as weaknesses.

## Comparing alternatives

Most architecture questions reduce to four options; compare them in one table with the same rows (team fit, delivery independence, risk, cost now, cost later, what it needs first):

| Option | Shape | Choose when |
|---|---|---|
| **A. Reinforced modular monolith** | One app, modules with public entries, enforced boundaries, tests around the core | One team, one release cadence, boundaries not yet clean (most cases) |
| **B. Shared base package** | A plus a versioned package (session, API client, errors, tokens, shell pieces) consumed by two or more apps | A second app already duplicates the core by hand |
| **C. Microfrontends (runtime composition)** | Several bundles in one page (Module Federation and similar) | Independent teams blocked by shared releases, same framework, platform team to own the shell; verified support for the framework version (`microfrontends.md`) |
| **D. Route-based apps** | Several apps behind a proxy or CDN, one session cookie, shared tokens and contracts | Independent teams or different stacks per area; SEO per app; the cheapest split when one is justified |

State which hard criteria hold today (teams, release blocking, technology needs, isolation requirements) and which prerequisites exist (clean boundaries, shared packages, single session, independent CI/CD, observability per app, an owner for the shell). When none hold, say so in one sentence and stop recommending C or D; define the measurable criteria that would reopen the decision and, if useful, a bounded spike that is defined but not authorized.

## The report

Use `assets/audit-report-template.md`. In order: executive summary with the short answer and five to seven facts; inventory; dependency map (method, matrix, horizontal edges explained); demonstrated problems (table with id, evidence, why it matters for the decision); hypothetical risks (separate section); what is good; options comparison; recommended target architecture (shape of the code, rules that keep it, what it deliberately leaves out); migration plan in reversible phases with exit criteria; risks of the recommended path and of the alternatives; measurable criteria to reopen the decision; proposed ADR (`assets/adr-template.md`); annex with commands, dates, environment and classification used.

Writing rules: numbers only when measured, with the command; `path:line` for every demonstrated claim; one voice; no generic advice that does not apply to this codebase; the summary stands alone.

## Time budget and delivery checklist

A useful audit of a 50–100k-line app takes one to three days; most of it is reading code at the locations the tools point to and reconciling organization facts. Suggested split: inventory and tools (15%), reading and confirming (45%), options and target architecture (20%), writing (20%). Shorter audits answer one question with the same evidence discipline and skip sections 5–8 of the template.

Before delivering, check:
- [ ] The short answer appears in the first paragraph and matches sections 4, 6 and 10
- [ ] Every row in the problems tables has `path:line` or a command; hypothetical risks are in their own section with their condition
- [ ] Every number has a command, a date and an environment in the annex
- [ ] Versions and framework support claims cite the source (npm metadata, official docs, issues) with dates
- [ ] "What is good" exists and is specific
- [ ] The recommendation names what it deliberately does not do and the criteria to reopen it
- [ ] The classification file used by the tools is attached so the matrix can be reproduced
- [ ] Nothing in the audited repository was modified (`git status` clean, same as at the start)

Reference for the shape and depth expected: a full audit of an 80k-line Nuxt 4 panel produced with this method answered "microfrontends or modular monolith?" with seven facts (one developer, one pipeline, four merges in ten days; code grouped by folder without boundaries; 116 horizontal edges of which 64 went through two misnamed core files; shell depending on a domain; a compact session core; a hub page aggregating nine clients; no application tests), fourteen demonstrated problems with locations, six hypothetical risks with their conditions, a verified status of Module Federation for the installed Nuxt version, four options compared, a phased plan, and measurable criteria to reopen the decision.

## What an audit must not do

- Edit, format or "fix while reading" any file in the audited repository.
- Install packages, change lockfiles, run migrations or deploy anything.
- State a number nobody measured ("the bundle is huge") or a version from memory.
- Recommend microfrontends because the backend has microservices, because the app is big, or because the folder count is high.
- Recommend a framework migration as the answer to a performance or structure problem.
- Treat `heuristic` tool output, lint warnings or hunches as demonstrated problems.
- Hide uncertainty: anything not verified goes in the "could not verify" list with what it would take.
