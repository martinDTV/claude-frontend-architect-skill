# Lexical vs semantic engine: measurements

Numbers printed by `verification/tools/benchmark.mjs` on 2026-10-28 (macOS, Node 22.23, Apple Silicon). Both engines run in the same process through `buildGraph`; time is wall-clock around the graph build, heap is the `heapUsed` delta around it after a forced GC (`node --expose-gc`). Reproduce with:

```bash
node --expose-gc verification/tools/benchmark.mjs                       # fixtures with ground truth
node --expose-gc verification/tools/benchmark.mjs --real <project-root> [--config <file>]   # a real project, read-only
```

## Fixtures (ground truth in `expected-edges.json`)

`verification/tools/fixtures/ts-paths` is a 14-file project written for this purpose: `tsconfig` aliases that only `paths` know (`#core/*`, `#ui`), a barrel with value and type re-exports and `export *`, a runtime cycle between two domains, type-only imports of another domain's internals, a side-effect import, a literal and a non-literal dynamic import, an import of a missing file, two `.vue` components and two declared packages without `node_modules`. The expected 19 edges (12 runtime, 7 type) were written by hand before the engine ran against them and were never adjusted to make a run pass. The fixtures ship no `node_modules`, so the semantic engine borrows `typescript` 5.9.3 and `vue/compiler-sfc` 3.5.44 from `verification/vue` through `--typescript` / `--vue-compiler`, exactly as the tests do.

| fixture | engine | edges | TP | FP | FN | precision | recall | F1 | unknown symbols | unresolved imports | time ms | heap MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ts-paths | lexical | 11 | 11 | 0 | 8 | 100% | 57.9% | 73.3% | 0 | 0 | 9 | 1.0 |
| ts-paths | semantic | 19 | 19 | 0 | 0 | 100% | 100% | 100% | 0 | 2 | 225 | 27.0 |
| nuxt-app | lexical | 51 | – | – | – | – | – | – | 4 | 0 | 18 | 2.6 |
| nuxt-app | semantic | 51 | – | – | – | – | – | – | 4 | 0 | 58 | 7.2 |
| next-app | lexical | 10 | – | – | – | – | – | – | 0 | 0 | 5 | 0.8 |
| next-app | semantic | 10 | – | – | – | – | – | – | 0 | 0 | 12 | 2.7 |

The eight edges the lexical engine misses on `ts-paths`, and why:

| Missing edge | Cause |
|---|---|
| `features/checkout/total.ts → core/orders/internal/pricing.ts` (runtime) | `#core/*` alias exists only in `tsconfig` `paths` |
| `features/checkout/total.ts → core/orders/index.ts` (runtime and type) | same alias, barrel import; the type-only import is a second statement |
| `features/reports/report.ts → core/orders/internal/pricing.ts` (type) | `#core/*` alias, `import type` |
| `features/reports/report.ts → shared/ui/index.ts` (runtime) | `#ui` maps to a file, not a directory |
| `features/checkout/label.ts → core/billing/invoice.ts` (runtime) | `#core/billing/invoice` alias; this edge closes the billing ↔ checkout cycle, so the lexical engine also misses the `domain-cycle` finding |
| `components/OrderCard.vue`, `components/StatusBadge.vue → core/orders/index.ts` (type) | `import type … from '#core/orders'` inside `<script setup>` |

The two semantic "unresolved imports" are the intended ones: the non-literal `import(name)` in `lazy.ts` and `./does-not-exist` in `report.ts`. `vue` and `zod` are declared in `package.json` and are counted as packages, not unresolved. The 51 and 10 edges of the Nuxt and Next fixtures are identical sets under both engines (the fixtures were written for the lexical engine and use only `~/`, `@/` and relative imports); what changes there is the metadata per edge (`resolution: typescript` instead of `lexical-alias`) and the Next rules that only the semantic engine evaluates (`server-only-in-client`, `server-env-in-client`), covered by the tests.

## Real projects (read-only, this machine)

Two local Nuxt 4 applications, analysed with their own compilers. No real Next.js project exists on this machine; the Next adapter is validated on the fixture only.

| Project | engine | files | edges | runtime | type | verified | unknown symbols | unresolved imports | graph ms | heap MB | typescript | vue/compiler-sfc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Back-office app (80k lines, flat auto-imports, `.nuxt` present, pnpm) | lexical | 294 | 1,516 | 1,268 | 248 | 1,516 | 2 | 0 | 159 | 20.7 | – | – |
| same | semantic | 294 | 1,512 | 1,264 | 248 | 1,512 | 3 | 9 | 889 | 140.7 | 6.0.3 (project) | 3.5.34 (project, via `nuxt`) |
| Clinic SaaS frontend (`app/features/*`, Pinia Colada) | lexical | 151 | 474 | 381 | 93 | 474 | 1 | 0 | 64 | 4.9 | – | – |
| same | semantic | 151 | 480 | 381 | 99 | 480 | 1 | 0 | 466 | 55.9 | 5.9.3 (project) | 3.5.44 (project) |

Resolution methods reported by the semantic engine: back-office `typescript` 508 import edges, `tsconfig-paths` 8, `nuxt-metadata` 996 auto-import and component edges, `builtin` 5 package references; clinic `typescript` 408, `relative` 72, `builtin` 5. No per-file fallbacks in either project (every `.vue` compiled with `compileScript`).

### What changed, edge by edge

- **Back-office, 3 edges only the lexical engine reported, all false positives.** `app/composables/useBusqueda.ts → app/utils/texto.ts` through the auto-import `plural`: the file uses `unidad.plural` (a property, lines 600–601) and declares `plural: string` in a type (line 76). `app/types/pre.ts → app/utils/texto.ts`: `plural` is a type member and object keys (lines 47, 55–58). `app/pages/index.vue → app/utils/bitacora.ts` through `vencimiento`: the page imports `vencimientoDe` explicitly and uses `vencimiento` only as an object key and a property (`f.vencimiento`, lines 135, 165, 502–505). The AST only counts value identifiers, so these disappear; the corresponding `shell-depends-on-domain` finding at `pages/index.vue:135` disappears with them.
- **Back-office, 9 unresolved imports only the semantic engine lists.** Six in `infra/**`, a CDK app with its own `package.json` whose `node_modules` is not installed (`aws-cdk-lib/*`, `@planouno/cdk-constructs`); three in `vueform.config.ts` (`@vueform/vueform`, not installed in the root `node_modules`). Reported as `info`, never as edges.
- **Back-office, one finding upgraded.** `domain-cycle` moved from `heuristic` to `confirmed` because both directions are runtime imports resolved by TypeScript.
- **Clinic, 6 edges only the semantic engine reports.** `import type { components } from '~/shared/api/schema'` in four feature `types.ts` files, plus two relative imports from `shared/api`: the target is `schema.d.ts`, which the lexical resolver never probed. All six are `type` edges to `shared`; they create no finding.

### Findings of the six graph tools, both engines

| Project | tool | lexical | semantic | only lexical | only semantic | level changes |
|---|---|---|---|---|---|---|
| Back-office | `domain-deps` | 37 | 45 | 2 | 10 | 1 |
| Back-office | `contracts-check` | 0 | 0 | 0 | 0 | 0 |
| Back-office | `state-audit` | 32 | 32 | 0 | 0 | 0 |
| Back-office | `routes-audit` | 10 | 10 | 0 | 0 | 0 |
| Back-office | `leak-patterns` | 2 | 2 | 0 | 0 | 0 |
| Back-office | `component-complexity` | 84 | 83 | 2 | 1 | 0 |
| Clinic | `domain-deps` | 6 | 6 | 0 | 0 | 0 |
| Clinic | `contracts-check` | 5 | 5 | 0 | 0 | 0 |
| Clinic | `state-audit` | 18 | 18 | 0 | 0 | 0 |
| Clinic | `routes-audit` | 0 | 0 | 0 | 0 | 0 |
| Clinic | `leak-patterns` | 3 | 3 | 0 | 0 | 0 |
| Clinic | `component-complexity` | 7 | 6 | 1 | 0 | 0 |

The `domain-deps` differences on the back-office app are the three false positives above (one of them produced a finding), the nine `unresolved-import` info findings, one `shell-depends-on-domain` finding whose line moved and then matched again after the component lines were sorted in source order, and the cycle upgrade. The `component-complexity` differences are all `god-template` flags that depend on template depth: the lexical count is inflated by `>` inside attribute expressions (`v-if="a > b"`, `@click="() => …"`), the AST depth is the element nesting the compiler sees (`planos/proyecto/[id].vue` 15 → 12, `notificaciones/index.vue` 14 → 12, `administracion/configuracion/index.vue` 12 → 13, clinic `BookingAssistant.vue` 13 → 9, a file with nine such attribute lines). On `administracion/configuracion/index.vue` the state count rose from 16 to 21: five `ref<Record<string, …>>()` declarations whose nested generics the lexical pattern could not cross.

## Reading these numbers

- Precision and recall exist only where a ground truth exists (`ts-paths`). On the real projects the comparison is a diff, with each differing edge read in the code.
- Cost: four to six times the lexical time and five to eleven times its heap, still under one second and 150 MB on a 300-file application. The parse happens once per run; every tool rebuilds the graph, so a full audit of six tools on the back-office app takes about 5 s instead of 1 s.
- *Unknown symbols* do not change between engines because they depend on the Nuxt catalog (metadata plus conventions), not on the parser; the third unknown in the back-office app is `plural`, now reported as unknown in a file where the lexical engine had turned it into an edge.
