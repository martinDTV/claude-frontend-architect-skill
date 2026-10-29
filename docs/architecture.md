# Internal architecture of the plugin

## Layout

```
.claude-plugin/marketplace.json           marketplace catalog (one plugin)
plugins/frontend-architect/
├── .claude-plugin/plugin.json
├── skills/
│   ├── frontend-architect/               core skill
│   │   ├── SKILL.md                      workflow, stages, task → references selection, defaults, rules, scripts (~2.7k tokens on invoke)
│   │   ├── references/ (38 files + index.md)  capability packs loaded on demand; index.md is the full catalog
│   │   ├── scripts/ (7 tools + lib/)     read-only audit scripts, dependency-free Node; lib/semantic/ = TypeScript/SFC engine (1.2), symbols, workspaces, optional checker (1.3)
│   │   └── assets/                       ADR template, audit report template, audit config example, Lighthouse budgets
│   └── creative-frontend/                visual design, motion and 3D skill
│       ├── SKILL.md
│       └── references/ (11 files)
├── agents/frontend-reviewer.md           read-only audit subagent (runs the scripts)
└── evals/ (66 scenarios)                 claude plugin eval suite; one scaffolded audit case
verification/                             compiles and tests the documented code and the scripts (not installed)
├── extract.mjs, vue/ react/ next/ nuxt/ creative/   @verify extraction and real compilers
├── ssr-test/                             SSR cross-request leak test
├── depcruise/                            boundary rules fixture
├── tools/                                node:test suites (82), five fixture apps (nuxt, next, ts-paths, vue-templates, monorepo; three with ground truths), 1.2.0 JSON contract snapshots and the lexical-vs-semantic benchmark
└── plugin-check.mjs                      manifests, references, scripts and evals consistency
docs/                                     research, this document, validation report
```

## Decisions

**Two skills, still.** The 1.1 evolution added twenty new capability areas and the question of splitting into many skills came back. The answer stayed: a skill is a *trigger surface* (its description is always in context; several overlapping descriptions make selection ambiguous and double the loaded context), while a capability is a *knowledge module* loaded on demand. So the new areas are reference files behind a selection table in `SKILL.md` ("Selecting references": task → two or three files), and `creative-frontend` widened from motion/3D to visual design because visual judgment has a distinct trigger ("make it look professional") and a distinct audience. `disable-model-invocation` was considered for a user-only audit skill and rejected: Claude Code accepts the field but does not enforce it for plugin skills, and the audit is a workflow of the core skill plus the agent.

**Boundaries between the two skills.** `frontend-architect` owns structure: tokens architecture, component libraries, accessibility rules, performance budgets, charts engineering. `creative-frontend` owns judgment: art direction, typography, color, layout craft, density, enterprise UI patterns, motion design, animation lifecycle, 3D. Each file points to the other skill by bare filename where the topics meet (`design-systems.md` ↔ `visual-design.md`; `data-tables.md` ↔ `enterprise-ui-patterns.md`; `charts.md` is the single home for charts with both engineering and encoding rules).

**One agent, now with instruments.** `frontend-reviewer` keeps context isolation and read-only tools; it runs the audit scripts first and must report evidence tiers (demonstrated in code, measured by a tool or command, hypothetical). Specialist agents were again rejected: they would duplicate reference content and produce conflicting instructions.

**Scripts inside the skill, tests outside the plugin.** Executable tools live in `skills/frontend-architect/scripts/` so they ship with the plugin and are referenced as `${CLAUDE_SKILL_DIR}/scripts/<tool>.mjs` (works for marketplace installs and for manual copies of the skill). They are dependency-free Node ESM, read-only by construction (one explicit `--write-baseline` exception), and every output is tagged `confirmed`, `heuristic` or `info`. Until 1.1 they were lexical; 1.2 added a semantic engine (below) and kept the lexical one as fallback. Their tests and fixture apps live in `verification/tools/` and are not installed. The motivating gap was real: an audit of an 80k-line Nuxt app had to build its domain dependency graph by hand because dependency-cruiser cannot see auto-imported composables or components used in templates; `domain-deps.mjs` resolves both using Nuxt's own naming rules.

**A semantic engine without dependencies (1.2).** The scripts stay dependency-free by borrowing the compilers the audited project already has: `typescript` and `vue/compiler-sfc` are loaded from its `node_modules` with `createRequire`, validated for the API they must expose, and used for syntax trees and module resolution only (no program, no type checker, no project config executed). The alternatives were rejected: bundling a parser would add a dependency to a plugin that installs by copying files and would drift from the project's TypeScript version; running `vue-tsc` or `nuxt typecheck` would execute project configuration. The resolver uses the project's `tsconfig` (for Nuxt, the generated `.nuxt/tsconfig.app.json`), so aliases are resolved the way the build resolves them, and each edge records how it was resolved and whether it is a runtime or a type dependency. The lexical engine is unchanged and selectable; `--engine auto` falls back to it with a stated reason when `typescript` is missing or lacks the JavaScript API (TypeScript 7). A fixture with a hand-written ground truth (`verification/tools/fixtures/ts-paths`) and a benchmark compare the two engines; design and limits are in `docs/semantic-engine.md`.

**Resolution levels, stated per result (1.3).** The engine never claims more than it did. An edge says how its module was found (`resolution`), each imported name says where it is declared and how many barrel hops away (`origins`, syntactic), `--typecheck` adds the compiler's verdict only for the importers a TypeScript Program can hold and only under a file budget, template components say whether they are local, built-in, registered (verified by Nuxt metadata), inferred, a package's, dynamic or unknown, `bundle-budget` says whether its scope is a manifest or a directory and whether the inventory is complete, and exclusions are printed with what they removed. The alternatives rejected were a mandatory type checker (memory grows with the project and `.vue` files stay outside the Program) and silent exclusions (a finding that disappears without a trace is worse than noise). Workspaces are resolved from `package.json` `exports` rather than from `node_modules` links so results do not depend on the install state, and an app inside a bigger workspace never follows its siblings: the audited root is the authorised scope.

**Progressive disclosure, four layers.** The frontmatter description (~230 tokens, always on) is the trigger. `SKILL.md` (~2.7k tokens on invoke, measured with `claude plugin details`; it was ~5.1k before the full reference catalog moved out) holds the workflow, the stage table, a task → references selection table, a defaults table, the rules and the one-paragraph script list. `references/index.md` is the complete catalog with a "read when" line per file, read only when a task fits no selection row. References are one level deep with a `Contents` section when longer than 100 lines; scripts, assets and the scripts' README are read only when used. `plugin-check.mjs` accepts references linked from the index as linked.

**Decision format.** Big decisions follow one format (context → alternatives → costs → benefits → risks → anti-patterns → adoption conditions → review triggers) in `decision-catalog.md`, and ADRs reuse it. This is what keeps different references from giving incompatible advice on the same problem: the catalog is the single place where trade-offs are stated, and topic references point to it.

**Verified examples.** Code examples carry `@verify` markers; `verification/extract.mjs` writes them into five projects (vue, react, next, nuxt, creative) that run real compilers, tests and builds. New in 1.1: Vitest in the creative project (Three.js disposal and cleanup-stack tests), concurrency and tenant tests in the vue project, and `plugin-check.mjs`, which fails when a reference is unlinked, a cross-reference is dangling, a script is undocumented or not executable, manifests disagree, or an eval case is malformed (things `claude plugin validate` does not check).

**Evals in the native format.** `claude plugin eval` discovers `evals/<case>/prompt.md` + `graders/*.md` and `case.yaml`. Every case includes negative criteria; the 1.1 cases add explicit "say no" scenarios (no microfrontends with `@module-federation/nuxt`, no Redux for four pages, no Three.js for a tilt effect, no framework migration for performance) and one scaffolded audit case that requires `--allow-tools Bash` to exercise the scripts.

## Namespacing and activation

Skills activate from their `description` when a task matches. Plugin components are namespaced by the plugin name (`frontend-architect`). The agent is selected by Claude from its description or can be requested explicitly ("use the frontend-reviewer agent"). Scripts are never loaded into context; Claude runs them through Bash when the skill or the agent says so.
