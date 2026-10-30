# Lexical vs semantic engine: measurements

Numbers printed by `verification/tools/benchmark.mjs` (macOS, Node 22.23, Apple Silicon). All engines run in one process through `buildGraph`; the compilers are loaded once in a warm-up pass before timing; time is wall-clock around the graph build, heap is the `heapUsed` delta around it after a forced GC (`node --expose-gc`). These are local measurements, not performance guarantees. Reproduce with:

```bash
node --expose-gc verification/tools/benchmark.mjs                                   # fixtures with ground truth
node --expose-gc verification/tools/benchmark.mjs --baseline <scripts dir of another version>   # e.g. a `git archive` of a tag
node --expose-gc verification/tools/benchmark.mjs --real <project-root> [--config <file>]      # a real project, read-only
```

## Fixtures (ground truth written before the engines ran, 2026-10-29)

Three fixtures carry a hand-written `expected-edges.json` (unique from/to/kind pairs): `ts-paths` (tsconfig aliases, barrels with value and type re-exports and `export *`, a runtime cycle, type-only imports, dynamic imports, two SFCs; also `expected-symbols.json` with 18 import names), `vue-templates` (Vue special elements, kebab-case and `Lazy` tags, `<component is>` and `:is`, auto-imports used only inside template literals, JSDoc and HTML comments that mention components) and `monorepo` (a pnpm workspace: a Nuxt app, a UI package with `exports` and subpaths, a shared package, a cross-package barrel, a deep import of an unpublished subpath, four symbol origins including one that no file declares). No truth file was edited after a run. The baseline rows are the 1.2.0 scripts (`git archive 06ff657`) on the same fixtures.

| fixture | engine | edges | TP | FP | FN | precision | recall | F1 | unknown symbols | unresolved imports | symbols ok | time ms | heap MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ts-paths | lexical | 11 | 11 | 0 | 8 | 100% | 57.9% | 73.3% | 0 | 0 | – | 3 | 0.8 |
| ts-paths | semantic 1.3 | 19 | 19 | 0 | 0 | 100% | 100% | 100% | 0 | 2 | 18/18 | 9 | 2.3 |
| ts-paths | semantic 1.2 (baseline) | 19 | 19 | 0 | 0 | 100% | 100% | 100% | 0 | 2 | 0/18 | 7 | 2.0 |
| vue-templates | lexical | 7 | 4 | 1 | 2 | 80% | 66.7% | 72.7% | 1 | 0 | – | 3 | 0.6 |
| vue-templates | semantic 1.3 | 8 | 6 | 0 | 0 | 100% | 100% | 100% | 1 | 4 | – | 9 | 2.4 |
| vue-templates | semantic 1.2 (baseline) | 6 | 4 | 0 | 2 | 100% | 66.7% | 80% | 3 | 4 | – | 11 | 1.9 |
| monorepo | lexical | 4 | 4 | 0 | 7 | 100% | 36.4% | 53.3% | 0 | 0 | – | 1 | 0.3 |
| monorepo | semantic 1.3 | 11 | 11 | 0 | 0 | 100% | 100% | 100% | 0 | 0 | 4/4 | 6 | 1.4 |
| monorepo | semantic 1.2 (baseline) | 4 | 4 | 0 | 7 | 100% | 36.4% | 53.3% | 0 | 8 | 0/4 | 4 | 1.7 |
| nuxt-app (no truth) | lexical | 51 | – | – | – | – | – | – | 4 | 0 | – | 6 | 2.5 |
| nuxt-app (no truth) | semantic 1.3 | 51 | – | – | – | – | – | – | 4 | 0 | – | 32 | 6.2 |
| next-app (no truth) | lexical | 15 | – | – | – | – | – | – | 0 | 0 | – | 2 | 0.9 |
| next-app (no truth) | semantic 1.3 | 15 | – | – | – | – | – | – | 0 | 1 | – | 8 | 3.1 |

Edge-level counts differ from the "edges" column because the truth is on unique pairs (several import statements between two files count once).

What changed between 1.2 and 1.3 on the fixtures:

- **vue-templates**: 1.2 missed `<component is="CrmBadge">` and the literal inside `:is` (two false negatives) and reported `component`, `transition` and `keep-alive`-style special elements as unknown (3 unknowns → 1, the deliberately missing `TotallyMissing`). Neither version creates an edge from the file whose only mentions of components live in JSDoc, a line comment, a string and an HTML comment; the lexical engine does (its one false positive) and it also misses the two `is` edges.
- **monorepo**: 1.2 resolved nothing by package name without `node_modules` (8 unresolved imports, 7 false negatives); 1.3 resolves the two workspace packages through `exports`/`main`, keeps `left-pad` as an external package, and places the four symbol origins (two barrel hops for a name published by one package and declared in another; one `not-found`).
- **ts-paths**: identical edges; 1.3 adds the 18 symbol origins (5 through barrels, 1 through `export *`).
- The lexical engine misses eight `ts-paths` edges (tsconfig-only aliases, barrels, the edge that closes a cycle) and seven monorepo edges; those gaps are the reason the semantic engine exists.
- `--typecheck` on `ts-paths`: a Program of 12 files, 14 names checked (the 4 names of `.vue` importers are outside it), 14 agreements, 0 corrections, 175 ms and 48 MB; over a budget of 2 files it is skipped with a reason and the syntactic origins stand.

Cost: on these small fixtures the 1.3 semantic engine costs 10–40% more time than 1.2 (symbol origins and component classification) and under 1 MB more heap; the lexical engine stays 3–5× cheaper.

## Real projects (read-only, this machine, 2026-10-29)

Two local Nuxt 4 applications analysed with their own compilers; no real Next.js project exists on this machine (the Next adapter is validated on the fixture and on the reference project built by the harness). Names and paths are withheld; mechanisms and counts are what matter.

| Project | engine | files | edges | runtime | type | unknown symbols | unresolved imports | fallbacks | time ms | heap MB |
|---|---|---|---|---|---|---|---|---|---|---|
| Nuxt enterprise application (80k lines, flat auto-imports, pnpm, `.nuxt` present; `typescript` 6.0.3 and `vue/compiler-sfc` 3.5.34 from the project) | lexical | 305 | 1,544 | 1,292 | 252 | 2 | 0 | 0 | 145 | 21.1 |
| same | semantic 1.3 | 305 | 1,540 | 1,288 | 252 | 1 | 3 | 0 | 484 | 82.0 |
| Medical SaaS (Nuxt 4, `app/features/*`, Pinia Colada; `typescript` 5.9.3, `vue/compiler-sfc` 3.5.44) | lexical | 153 | 486 | 391 | 95 | 1 | 0 | 0 | 33 | 4.8 |
| same | semantic 1.3 | 153 | 492 | 391 | 101 | 1 | 0 | 0 | 183 | 21.8 |

Symbol and component statistics of the semantic engine (1.3 only):

| Project | import names | declared | through barrels | `export *` | not found | declaration files | components: local / builtin / metadata / package / dynamic / unknown | derived edges with `--follow-reexports` |
|---|---|---|---|---|---|---|---|---|
| Enterprise application | 1,004 | 1,002 | 57 | 0 | 2 | 0 | 3 / 49 / 436 / 654 / 7 / 1 | 57 |
| Medical SaaS | 1,135 | 1,135 | 188 | 0 | 0 | 7 | 62 / 8 / 0 / 180 / 0 / 1 | 160 |

Read against 1.2 (`docs/validation-report.md`, 1.2.0 addendum): the enterprise application's unknown components went from 3 to 1 (the two special elements are now built-ins; the remaining unknown is a component name the installed UI library does not register), the three lexical auto-import false positives stay removed, and the two `not found` names are imports of names that no module in their re-export chain declares (worth a look in the project; the type checker would say the same). In the medical SaaS the first 1.3 run reported 28 names as not found: all were default exports of `.vue` components re-exported by feature barrels, which the resolver now treats as declared by the component file; the seven `declaration files` are type imports from a generated OpenAPI schema `.d.ts`. `contracts-check` on the enterprise application's six module entries reports, per module, the names it publishes that are declared outside the modules tree (49 of 49, the expected state of barrels created before the files move); on the medical SaaS it reports 203 public exports never imported from outside (a large public surface to prune).

## 1.4.0 addendum (2026-10-29, same machine)

### Type-checker cost on real projects (read-only, `domain-deps`)

Measured with `/usr/bin/time -l` on the two calibration projects, default budgets (`--typecheck-max-files 2500`, `--typecheck-max-source-mb 20`, `--typecheck-max-heap-mb 1024`), nothing modified in either project:

| Project | Run | Wall | User CPU | Peak RSS | Program | Checker result |
|---|---|---|---|---|---|---|
| Nuxt enterprise application (80k lines, two layers) | plain | 1.51 s | 2.78 s | 266 MB | – | – |
| same | `--typecheck` | 3.48 s | 5.9 s | 636 MB | 94 root files, 1,436 source files loaded, 2,154 ms, +386 MB heap | 273 origins checked, 273 agree; 725 names in `.vue` importers reported as outside the Program |
| Medical SaaS (Nuxt 4 + Pinia Colada) | plain | 0.77 s | not recorded | 193 MB | – | – |
| same | `--typecheck` | 2.66 s | not recorded | 555 MB | – | 551 origins checked, all agree (before the 1.4 fix, 7 `declaration-file` agreements were counted as disagreements) |

No budget triggered on either project. The budgets are enforced before the Program is created (files and source MB) and after it (heap: a synchronous `Program` cannot be interrupted, so an over-budget heap discards the checker results and keeps the syntactic origins, with the reason in `analysis.typechecker`). `analysis.typechecker` now records root files, source files, wall ms, CPU ms, heap MB and RSS MB, so a CI reader can tell whether the checker ran completely.

### Rule-level precision on the fixtures with finding truths

Output of `node --expose-gc verification/tools/benchmark.mjs` (new section; truths written before the rules ran):

| fixture | tool | engine | expected | reported | TP | FP | FN | precision | recall | F1 | time ms | peak RSS MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ui-app | ui-audit.mjs | lexical | 32 | 29 | 23 | 6 | 9 | 79.3% | 71.9% | 75.4% | 65 | 51 |
| ui-app | ui-audit.mjs | semantic | 32 | 32 | 32 | 0 | 0 | 100% | 100% | 100% | 269 | 129 |
| ssr-app | state-audit.mjs | lexical | 5 | 0 | 0 | 0 | 5 | 100% | 0% | 0% | 60 | 51 |
| ssr-app | state-audit.mjs | semantic | 5 | 5 | 5 | 0 | 0 | 100% | 100% | 100% | 261 | 128 |

Reading the lexical rows: the lexical engine has no element tree, so the four unlabelled controls of `BadForm.vue` are reported as `review` instead of `static` (counted as a false positive and a false negative each, because the key includes the verification level), the wrapped control of `Wrapped.vue` and a label-wrapped input of `GoodForm.vue` become `review` (no parent chain to prove the wrapping label), the nested interactive is missed, and `Card.tsx` is not scanned at all. The SSR rules need the identifier context and are never emitted lexically: recall 0 is the documented behaviour, not a defect. The semantic rows are 100% on fixtures that were written to cover each rule once positively and once negatively; they say nothing about recall on patterns the fixtures do not contain.

### Browser mode on the local fixture

Six pages, three viewports, two text scales, `--interact --allow-submit --screenshots`, Chromium through Playwright 1.64.1 with axe-core 4.14.0: 27 findings and 18 masked screenshots in about 25 s; the complete browser suite (refusals, fixture truth, five-run visual lifecycle) takes 34 s on this machine. The refusal paths (no `--playwright`, remote host, forms without `--allow-submit`, output outside the allowed paths) return in well under a second each. These are local measurements on a static fixture; a framework application with a dev server will take longer per page.

## Reading these numbers

- Precision and recall exist only where a truth exists; on the real projects the comparison is a diff, with each differing edge read in the code.
- Cost: the 1.3 semantic engine is 3–6× the lexical time and 4–5× its heap on the real projects (0.5 s and 82 MB on 305 files); every tool rebuilds the graph, so a full six-tool audit takes seconds, not minutes. `--typecheck` adds a Program whose size follows the project's type reach; it is opt-in and budgeted.
- *Unknown symbols* depend on the Nuxt catalog (metadata plus conventions), not on the parser; what 1.3 changed is which names are candidates at all (special elements, `is` targets, local imports).
