# Semantic Architecture Engine (1.2.0, extended in 1.3.0)

The audit scripts in `plugins/frontend-architect/skills/frontend-architect/scripts/` build a file dependency graph. Until 1.1 that graph came from regular expressions over blanked source text (the *lexical* engine). Since 1.2 the six graph-based tools (`domain-deps`, `contracts-check`, `state-audit`, `routes-audit`, `leak-patterns`, `component-complexity`) can build it from syntax trees instead: TypeScript, TSX and JavaScript parsed with the audited project's own `typescript` package, Vue single-file components parsed with its own `vue/compiler-sfc`, and module specifiers resolved with the project's `tsconfig` through TypeScript's resolver. The lexical engine is kept as the fallback and stays selectable; nothing in the 1.1 output was removed.

## Contents

- [Selecting the engine](#selecting-the-engine)
- [Components](#components)
- [What is resolved, and how it is labeled](#what-is-resolved-and-how-it-is-labeled)
- [Nuxt](#nuxt)
- [Vue single-file components](#vue-single-file-components)
- [React and Next.js](#react-and-nextjs)
- [Effect on each tool](#effect-on-each-tool)
- [Safety and trust boundary](#safety-and-trust-boundary)
- [Limits](#limits)
- [How to verify a finding](#how-to-verify-a-finding)
- [JSON contract](#json-contract)
- [1.3.0: symbols, workspaces, policy, checker](#130-symbols-workspaces-policy-checker)

## Selecting the engine

| Flag | Values | Behavior |
|---|---|---|
| `--engine` | `auto` (default), `semantic`, `lexical` | `auto` uses the semantic engine when a usable `typescript` is found and falls back to lexical otherwise, stating the reason. `semantic` exits 2 with that reason instead of falling back. `lexical` is the 1.1 behavior |
| `--typescript <dir>` | a directory whose `node_modules` contains `typescript` | Overrides where TypeScript is loaded from (the project root by default, then the `nuxt`, `next`, `vite` and `vue-tsc` package directories for pnpm layouts) |
| `--vue-compiler <dir>` | a directory whose `node_modules` contains `vue/compiler-sfc` or `@vue/compiler-sfc` | Same override for the SFC compiler. Without it, `.vue` files are split lexically and only their `<script>` goes through the TypeScript parser (`engine: semantic-script+lexical-template` per file) |
| `--format` | `text`, `json`, `markdown` | Long form of `--json` / `--md` |

Every report prints an `Analysis` line (text and Markdown) and an `analysis` object (JSON) that says which engine ran, which `typescript` and `vue/compiler-sfc` versions were loaded and from where, which `tsconfig` files supplied the compiler options, how many edges each resolution method produced, and which files fell back to a partial analysis. Exit codes are unchanged: 0 no confirmed findings, 1 confirmed findings (with `--fail-on confirmed`), 2 the tool could not run.

A `typescript` package is "usable" when it exposes the JavaScript compiler API (`createSourceFile`, `resolveModuleName`, `parseJsonConfigFileContent`, `readConfigFile`, `forEachChild`). TypeScript 5.x and the 6.0 release do; the TypeScript 7 preview (the Go port published as `typescript` 7.0.x) ships only the `tsc` binary and is reported as *lacks the JavaScript compiler API* and skipped.

## Components

All under `scripts/lib/semantic/`; `scripts/lib/graph.mjs` chooses between `buildSemanticGraph` and the lexical `buildLexicalGraph` and gives both the same output shape.

| File | Role |
|---|---|
| `host.mjs` | Loads `typescript` and the SFC compiler from the project (or the override) with `createRequire`, validates the API list above, returns `{ available, ts, typescript: {version, source, path, reason}, sfc, vueCompiler }` |
| `tsconfig.mjs` | Reads the compiler options with TypeScript's own config reader (`readConfigFile` + `parseJsonConfigFileContent`, directory scanning disabled). Nuxt 4: `.nuxt/tsconfig.app.json` for `app/**`, `.nuxt/tsconfig.server.json` for `server/**`; otherwise the root `tsconfig.json` or `jsconfig.json`. Configs that only hold `references` are skipped |
| `ts-module.mjs` | Parses one module with `createSourceFile` (syntax only, no type checker) and collects imports (static, side-effect, re-export, literal dynamic, `require`), exports (value or type), file directives, declared names, value and type identifiers, calls and member calls, JSX tags |
| `vue-sfc.mjs` | `parse` + `compileScript` from `vue/compiler-sfc`: script bindings (`props`, `setup-ref`, `setup-reactive-const`, …), `defineProps` / `defineEmits` / `defineExpose` / `defineModel` counts, lifecycle calls, watchers, computed; template AST for component tags with lines, identifiers used in expressions, nesting depth. The script block goes through `ts-module.mjs` |
| `resolver.mjs` | Resolves a specifier from a file: `ts.resolveModuleName` with the file's compiler options, then tsconfig `paths`, then relative paths, declared dependencies and Node built-ins. Returns the target, the method and a confidence |
| `graph-semantic.mjs` | Builds the file records and the edges (`import`, `auto-import`, `component`) using the records above plus the Nuxt catalog from `.nuxt` metadata; keeps every lexical field so the tools' existing rules keep working |

## What is resolved, and how it is labeled

Each edge carries `kind` (`runtime` or `type`), `confidence` (`verified` or `inferred`), `resolution` (how the target was found) and, for imports, `importKind` and `specifier`.

| `resolution` | Meaning | Confidence |
|---|---|---|
| `typescript` | `ts.resolveModuleName` with the project's `moduleResolution`, `baseUrl` and `paths` found an existing project file | verified |
| `tsconfig-paths` | TypeScript did not resolve it (typically a `.vue` target without a declaration) but a `paths` mapping points at an existing file | verified |
| `relative` | A relative specifier that resolves to an existing file with the usual extension and index probing | verified |
| `package.json`, `node_modules`, `builtin` | A dependency declared in `package.json`, present in `node_modules`, or a Node built-in: counted under *packages imported*, never an edge | — |
| `nuxt-metadata` | An auto-imported symbol or a component that `.nuxt/types/imports.d.ts` or `.nuxt/components.d.ts` maps to that file | verified |
| `lexical-catalog` | An auto-import or component resolved only by this tool's re-implementation of Nuxt's scanning rules (metadata absent or lacking the entry) | inferred |
| `virtual` | Nuxt's `#imports`, `#app`, `#build`, `#components`: attributed to the `nuxt` package | — |
| `lexical-alias` | Lexical engine only: the 1.1 alias table (`~/`, `@/`, `~~/`, `#shared/`) | verified |

Imports the engine cannot place are listed under *Unresolved imports* with a reason and never become edges: `non-literal specifier` (dynamic import or `require` of an expression), `file not found`, `unresolved specifier` (a bare specifier that is neither declared nor installed), `resolves outside the project`. A type-only import (`import type`, `import { type X }`, `export type … from`) produces a `type` edge; a module that is imported both ways produces one edge per import statement, each with its own kind.

## Nuxt

- Compiler options come from the files Nuxt generates (`.nuxt/tsconfig.app.json`, `.nuxt/tsconfig.server.json`); they carry the `~`, `@`, `~~`, `@@`, `#shared`, `#imports` and layer aliases exactly as Nuxt resolves them. When `.nuxt/` is missing, a root `tsconfig.json` with `paths` is used, and when that is missing too, the lexical alias table.
- Auto-imported composables, utils and stores and template components are resolved as in 1.1: `.nuxt/types/imports.d.ts` and `.nuxt/components.d.ts` make them `verified`; the scanned catalog makes them `inferred`; symbols that resolve nowhere stay *unknown*. Freshness is checked (metadata older than the newest source is reported as stale). The tools never run `nuxt prepare`.
- What the AST adds: a symbol counts as used only when it appears as a value identifier (not as a property name, object key, string, comment or type annotation). On an 80k-line Nuxt 4 app this removed three auto-import edges that the lexical engine had reported (the names were object keys and property accesses, not calls to the auto-imported functions).

## Vue single-file components

- `parse` splits the SFC; `compileScript` compiles `<script setup>` (with `<script>` when both exist) and returns the bindings that drive `props`, `emits`, `state`, `computed` and `watchers` in `component-complexity`; the template AST gives component tags with lines, the identifiers used in expressions (for auto-import detection) and the real nesting depth. Depth from the AST ignores `>` inside attribute expressions (arrow functions, comparisons), which inflated the lexical count by up to four levels on real components.
- When `compileScript` fails (unsupported syntax, a macro misuse the compiler rejects) the file is recorded in `analysis.fallbacks` with the compiler's message and analyzed as script-through-TypeScript plus lexical template, so no file silently disappears from the graph.
- Resolution of `.vue` imports: TypeScript resolves `./Foo.vue` only when a `*.vue` declaration exists; otherwise the resolver falls back to `tsconfig-paths` or `relative`, still verified because the file exists.

## React and Next.js

- `'use client'` and `'use server'` are read as directive prologues from the AST (a string in a comment or later in the file does not count). `import 'server-only'` marks a module server-only.
- `domain-deps` computes the modules reachable through runtime import edges from each `'use client'` module. A client module that imports (directly or through other modules) a server-only module is reported as `server-only-in-client` (confirmed when every edge in the chain is verified; the message shows the chain). A `'use client'` module is a boundary: it never becomes "server-only" itself even when it imports one.
- `server-env-in-client` (heuristic): a direct `process.env.X` read in a client module, or in a module it imports one hop away, excluding `NEXT_PUBLIC_*` and `NODE_ENV`.
- Not flagged on their own: using `'use client'`, a client component importing a pure helper, a Server Action without a call to a specific `authorize` function (the tools do not know the project's authorization API; `routes-audit` keeps its heuristic for handlers without any visible check).

## Effect on each tool

| Tool | With the semantic engine |
|---|---|
| `domain-deps` | Edges from the resolver instead of the alias table; `kind` and `resolution` per edge; type-only edges lower the severity of boundary findings (`low` for shared/shell, `medium` for internal imports); `domain-cycle` only through runtime edges, `confirmed` when both directions are verified; type-only cycles are a note; `server-only-in-client`, `server-env-in-client`, `unresolved-import` (info); summary adds `engine`, `edgesByDependencyKind`, `edgesByResolution`, `unresolvedImports`, `packagesImported` |
| `contracts-check` | Same edges; `internal-import` is `confirmed` only on verified edges and `medium` instead of `high` when type-only; evidence shows the specifier and the resolution |
| `state-audit` | Same graph; rules unchanged (they read file records); `analysis` reported |
| `routes-audit` | Directives from the AST; otherwise unchanged |
| `leak-patterns` | A cleanup hook counts when it is a real call (`onBeforeUnmount`, `onUnmounted`, `onScopeDispose`, `useEffect` with a returned function, `.dispose()`), not a word in a comment or a string; rows carry `cleanupSource: ast|lexical` |
| `component-complexity` | `.vue` metrics from compiler bindings and the template AST (`metricsSource: ast`); `.ts/.tsx` metrics from the TypeScript AST for calls and JSX tags (`ast-script`); nested generics in `ref<Record<string, X>>()` no longer break the state count |
| `bundle-budget` | Not graph-based; unchanged |

## Safety and trust boundary

- Read-only: the engine opens files and never writes, installs, builds, or runs `nuxt`, `next`, `tsc` or any project script. The only write in the whole toolset remains `contracts-check --write-baseline`, as in 1.1.
- No project configuration is executed: `tsconfig` files are parsed as JSON by TypeScript's reader (`extends` chains are followed by reading files); `nuxt.config.ts`, `next.config.*`, plugins and transformers are never loaded. No TypeScript program or language service is created; only syntax trees and module resolution.
- The one trust boundary: with `--engine auto|semantic` the tool loads two libraries from the audited project's `node_modules` (`typescript` and `vue/compiler-sfc`) and runs them in its own process. These are the compiler packages the project already runs on every build, but they are code the auditor did not install. When auditing a repository you do not trust, pass `--typescript <trusted-dir> --vue-compiler <trusted-dir>` to load known copies, or `--engine lexical`. The API shape is validated before use and the loaded paths are printed in the `Analysis` line and in `analysis.typescript.path`.
- No network, no environment variables read, no shelling out. Outputs are deterministic for the same tree: files, edges and lists are sorted, timing is reported only in `analysis.durationMs`.

## Limits

- Syntax, not types. Without a type checker the engine does not follow symbols across barrels: `export * from './x'` is recorded as a re-export edge to `./x`, not expanded into the names it provides; an identifier auto-imported through a re-export chain is still matched by name against the Nuxt catalog.
- Dynamic and computed specifiers (`import(variable)`, `require(path.join(...))`) are unresolved by design and listed as such.
- Components registered globally at runtime (`app.component(...)`, `components: { … }` options API objects, Nuxt modules that register components without `.nuxt` metadata) are unknown symbols, not edges. JSX components are attributed only when their name is imported in the same file.
- Imports that resolve to packages are counted, not followed: the engine does not analyze `node_modules`.
- Nested packages inside the audited tree (an `infra/` CDK app with its own `package.json`, for example) are scanned as project files and their imports show up as unresolved when their dependencies are not installed; exclude them with `.frontend-audit.json` `exclude` patterns if they are noise.
- TypeScript 7 (Go) and projects without `typescript` installed fall back to the lexical engine with a stated reason; `.vue` templates fall back to lexical splitting when no `vue/compiler-sfc` is found (`filesPartial` in `analysis`).
- Performance: four to six times slower than the lexical engine and more memory (see `docs/benchmarks.md`): under one second and about 140 MB of heap on a 300-file Nuxt app.
- Not a replacement for `vue-tsc`, `tsc`, ESLint or dependency-cruiser: it does not type-check, lint or enforce rules; it measures structure and points at what to read.

## How to verify a finding

1. Read the `Analysis` line: engine, TypeScript version and path, tsconfig files, resolution counts, fallbacks. A `lexical` engine when you expected `semantic` means the reason printed there applies (no `typescript`, TS 7, pnpm layout without the fallback packages).
2. For a dependency, list the pair: `domain-deps.mjs . --edges <domainA>:<domainB>` prints from, to, kind, resolution, confidence, the symbol and the line.
3. `resolution: typescript` means the project's own compiler options resolve that import the same way; open the file at that line. `nuxt-metadata` means `.nuxt` generated by the project maps the symbol; `lexical-catalog` means it is inferred from folder conventions and should be read.
4. `kind: type` edges disappear at build time; findings on them are lower severity for that reason, but a type-only dependency on another domain's internals is still a contract to be published.
5. *Unresolved imports* are unknowns, not evidence of decoupling. Install dependencies or check the specifier before concluding anything.

## JSON contract

All 1.1 fields remain with the same meaning. Additions (1.2.0, `version: "1.2.0"`):

- top-level `analysis` in every graph-based tool (`engine`, `requested`, `reason`, `typescript`, `vueCompiler`, `tsconfig`, `resolution`, `fallbacks`, `filesSemantic`, `filesPartial`, `durationMs`); `domain-deps` also mirrors it under `data.analysis`;
- `domain-deps`: edges gain `kind`, `resolution`, `importKind`, `col`, `specifier`; `data.unknownImports`, `data.packageImports`; summary keys `engine`, `edgesByDependencyKind`, `edgesByResolution`, `unresolvedImports`, `packagesImported`; finding ids `server-only-in-client`, `server-env-in-client`, `unresolved-import`;
- `leak-patterns` rows gain `cleanupSource`; `component-complexity` rows gain `componentsUsed`, `lifecycleHooks`, `imports`, `metricsSource`;
- `contracts-check` `internal-import` findings gain `evidence`.

Nothing was renamed or removed; a consumer of the 1.1 JSON keeps working and can ignore the new keys.

## 1.3.0: symbols, workspaces, policy, checker

Everything below is additive: the 1.2 edges, findings and flags keep their meaning (the `compat` test suite checks every key path of the 1.2.0 JSON reports against snapshots under `verification/tools/contracts/1.2.0/`).

### Resolution levels

| Level | What produced the result | Where it shows |
|---|---|---|
| **lexical** | regular expressions over blanked code, the fixed alias table | `engine: lexical`, `resolution: lexical-alias / lexical-catalog` |
| **syntactic** | syntax trees (TypeScript parser, `vue/compiler-sfc`), module resolution with the project's `tsconfig`, barrels followed on the parsed exports | `resolution: typescript / tsconfig-paths / relative / workspace`, `origins[]` with `status` and `hops` |
| **metadata** | files Nuxt generated (`.nuxt/types/imports.d.ts`, `.nuxt/components.d.ts`) | `resolution: nuxt-metadata`, components `nuxt-metadata` |
| **checker** | a TypeScript Program and its type checker, opt-in | `origins[].verifiedBy: checker`, `analysis.typechecker` |

A report never upgrades a level silently: a `not-found` origin stays `not-found`, an unreferenced bundle asset is `unreferenced` (not `stale`) when the bundler's inventory is incomplete, and an excluded file is counted, not forgotten.

### Symbol origins (`lib/semantic/symbols.mjs`)

For each named import the resolver follows, on the parsed module records: `export { a as b } from './x'` (with the original name), `export * from './x'` (searched in source order, first module that declares the name wins, as ESM does; `export * as ns` yields a `namespace` result), `export { a }` where `a` was imported, and the default of a `.vue` module (the component itself). Chains are relative to each file so results are cached per file and `hops` is the number of barrel files between importer and owner. Statuses: `declared` (file, kind, line), `declaration-file` (a `.d.ts` the sources do not scan), `not-found` (no module in the chain declares the name: a real defect or a dynamic re-export the syntax cannot see), `external` (the chain leaves the project), `cycle`, `too-deep` (12 hops). Guards: a set of visited files per call, no caching of cycle results.

What the level means: the resolver knows the files and the names, not the types. `export =`, ambient module augmentation, namespace merging and re-exports produced at runtime are outside it; that is what `--typecheck` is for.

### `--follow-reexports` and `reexport-crosses-module`

`domain-deps --follow-reexports` adds one edge per (importer, declaring file) when the origin is a different file from the import target (`via: reexport`, `resolution: syntax-reexport`, `through` = the barrel, `hops`). The barrel edge stays; the derived edge lets the matrix, the hotspots and the cycles see who really owns the code. Off by default so 1.2 numbers are reproducible. `contracts-check` resolves every public name of a module entry and reports, per owner, the names declared in another module or outside the modules tree (`reexport-crosses-module`, info): a barrel that still points at files living elsewhere is a migration state to measure, not to hide.

### `--typecheck`

`lib/semantic/checker.mjs` creates a `ts.createProgram` over the TypeScript/JavaScript files of the audited root with the app compiler options (`noEmit`, `skipLibCheck`, `plugins` stripped) only when a tool asks for it and only under `--typecheck-max-files` (default 2500). For each origin of a non-`.vue` importer it asks the checker for the aliased symbol's first declaration and compares: agreement (`verifiedBy: checker`), correction (`disagreement: true`, the syntactic file kept as `syntacticFile`), resolution of something the syntax could not place (`resolvedByChecker`), or `unresolved`. `.vue` importers are counted as outside the Program (`skippedVueImporters`). Over budget or on failure the syntactic results stand and the reason is printed. Cost on the fixtures: about 150 ms and 40–50 MB for a dozen files; it grows with the libraries the project types reach, which is why it is not the default.

### Template components

Every component tag of a template is classified (`componentsByResolution`): `local` (imported or declared in the script), `builtin` (Vue special elements in any casing and the Nuxt/Vue components), `nuxt-metadata` (registered and verified), `catalog` (inferred from Nuxt's scanning rules), `package` (a dependency according to the metadata), `dynamic` (`<component :is="expr">`; `dynamicComponents[]` lists file, line and expression; string literals inside the expression are still resolved) and `unknown`. Only `unknown` names are reported as unknown symbols. `is="X"` resolves X; lowercase words in `:is` are HTML elements or data, never component names.

### Workspaces

`project.workspace` is read from `pnpm-workspace.yaml` or `package.json` `workspaces` (npm; yarn when `yarn.lock` exists); packages are the directories matching the globs that have a `package.json`. A bare specifier that names a workspace package resolves through its `exports` (string, conditions `import`/`default`/`module`/`require`/`types`, subpath maps and `*` patterns) or `main`/`module`/`types`, to an existing file (`resolution: workspace`, `confidence: verified`); a subpath the package does not publish still resolves to the physical file but is flagged (`exported: false`, `package-subpath-not-exported` in `contracts-check`). The nearest `package.json` above an importer supplies its declared dependencies, so an app's `left-pad` is a package, not an unresolved import. `tsconfig` `references` and the packages' own `tsconfig.json` become per-directory compiler options. A root with no framework of its own is `framework: workspace` (framework-specific rules apply when a tool runs inside an app). From inside an app that belongs to a bigger workspace, sibling packages are `packageImports[].scope: workspace`: named, counted, never followed, because the audited root is the authorised scope.

### Dependency policy

`dependencies.allowed` (pairs `[from, to]` of business domains) and `dependencies.exceptions` (`from`, `to`, `reason`, `since`, `until`) turn the descriptive matrix into a judged one: `forbidden-dependency` per pair, split into runtime and type-only file pairs (the type-only case is `low` and says "compile-time coupling only": it disappears at build time but still ties the domains at design time), `architecture-exception` (info) keeps tolerated pairs measurable, and a cycle whose both directions are allowed is `allowed-cycle` (info): a cycle by design is a fact to carry into any split decision, not a violation. A cycle with one excepted direction stays a `domain-cycle` and names the exception. Without a policy nothing changes.

### Exclusions

`exclude` patterns are validated when the configuration loads (absolute paths, `..`, backslashes, empty or catch-all patterns stop the tool with exit 2); bare directories match their subtree. Excluded files are not scanned; edges pointing at them are dropped and counted. Every report carries `excluded` (`patterns`, `files`, `unmatchedPatterns`, `importsToExcluded`, `sample`) and a note. The point is that an exclusion is a decision the reader can see, not a way to make findings vanish.

### Next.js

`client-only-in-server`: a Server Component or route handler of the App Router (segment files without `'use client'`) that reaches, through modules that are not client boundaries, a module with `import 'client-only'`. Confirmed when the chain is verified. `server-env-in-client` no longer counts a `'use server'` module imported by a client component (Server Actions run on the server). The Next.js reference project built by the harness (`verification/next`) is audited after `next build` with its own TypeScript: no boundary findings, the Server Function and the Route Handler inventoried, `.next` measured through its manifests.

### Bundle scope

`bundle-budget` builds the inventory of the current build from the framework manifests (Nuxt `client.manifest.mjs`/`client.precomputed.mjs` plus `builds/latest.json` and `builds/meta/*`; Next.js `build-manifest.json`, `app-build-manifest.json` when present, the App Router `*_client-reference-manifest.js` files and `BUILD_ID`; Vite `.vite/manifest.json`). Assets are `current`, `stale` (unreferenced with a complete inventory, or under another build id), `unreferenced` (unreferenced with an incomplete inventory: still measured) or `unknown` (no manifest: everything measured, scope `directory`). Totals cover current and unreferenced assets; stale ones are reported with their own size. Shared chunks come from the Nuxt import graph when available.

### Main-module guard

The seven tools start with `isMainModule(import.meta.url)`: real paths of `process.argv[1]` and of the module are compared, so symbolic links, relative invocations from another directory and paths with spaces run the analysis. The harness and CI run a tool through a symbolic link and fail when it prints nothing.
