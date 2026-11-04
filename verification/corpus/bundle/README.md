# Bundle area — adversarial corpus for route-attribution.mjs

Measures FP/FN of `route-attribution.mjs` (per-route bundle attribution). Ground truth is written **from the
build each scaffold produces, by hand, before running the tool** — never copied from the tool. A divergence
between the tool and `ground-truth.json` is a real result, not noise.

## How these cases are built (the only offline-deterministic path)

`route-attribution.mjs` needs a real production build (`.next` / `.output`) or it exits 2
("no production build found"). We do not build Next/Nuxt offline. Instead every `scaffold.sh`:

1. `cp -R` the committed, git-tracked fixture build at `verification/tools/fixtures/route-next-app/.next`
   (repo root resolved via `git rev-parse --show-toplevel`),
2. wipes its routes/chunks and writes its own `.next/server/app/<route>/page_client-reference-manifest.js`,
   `prerender-manifest.json`, `routes-manifest.json`, `app-path-routes-manifest.json`, and chunk files.

Chunk bodies are a base64-encoded AES-CTR keystream with a fixed passphrase: high-entropy and fully
reproducible, so gzip sizes are stable run to run (~0.757 of raw). This lets us place a chunk precisely above,
below, or on the 150 KB-gzip knife-edge that drives `route-heavy-initial-chunk`.

## The defect signal in this area

`route-attribution` emits three ids:
- `route-heavy-initial-chunk` — **heuristic** — the single largest chunk in a route's INITIAL set has gzip
  size >= 150 KB. This is the only defect-level signal, so it is what `expected`/`forbidden` target.
- `route-attribution` — **info** — one per build-attributed route. Not defect-level; `out_of_scope` here.
- `route-attribution-unavailable` — **info** — the artifact does not expose a route's chunks. Honest, not a
  defect; `out_of_scope` here.

The measurer only counts `confirmed`/`heuristic` findings as TP/FP, so the two info ids never score; they are
listed in `out_of_scope` for documentation.

All `route-heavy-initial-chunk` findings are attributed to a route **path** (e.g. `/heavy`), so their
`expected` entries carry `line: null`.

## Cases

| # | category | what it exercises |
|---|----------|-------------------|
| 01 | real-defect | `/app` ships a ~222 KB gzip chunk in its initial set (async:false) -> fires |
| 02 | correct-suspicious | `/editor` references a ~222 KB chunk but async:true (lazy) -> must NOT fire |
| 03 | ambiguous | `/catalog` largest initial chunk 149.8 KB gzip — just under the 150 KB cutoff |
| 04 | insufficient-context | `/orphan` in routes-manifest, no client-reference manifest -> unavailable [info] |
| 05 | combined-defects | one build: `/heavy` fires, `/editor` (lazy) must not, `/orphan` unavailable |
| 06 | negative-control | three routes, every initial chunk < 70 KB gzip -> no defect-level finding |

## What is NOT verifiable offline (documented, not faked)

- **Transferred / evaluated / used bytes.** The tool is explicit that a *built*, *route-associated* chunk is
  not *browser-requested*, *transferred*, *evaluated* or *used* JavaScript. Those require a running browser
  (browser-audit vitals/interactions/hydration-cost and the Coverage panel) and cannot be measured from a
  copied static build. This corpus only exercises up to "route-associated", which is all the tool claims.
- **Turbopack server/RSC cost.** A Turbopack build emits no `app-build-manifest.json`, so the server-side
  RSC/module cost of a route is never attributed. We cannot produce a genuine Turbopack build offline to
  exercise that path differently from case 04's "unavailable".
- **next/dynamic deferred-chunk attribution.** Deferred client chunks are listed in
  `react-loadable-manifest.json` only when a webpack (not Turbopack) build emits it; the fixture build does
  not, so the tool reports `deferred.verifiable: false`. We model deferral via `async:true` in the
  client-reference manifest (case 02/05), which is the part the tool actually reads for the initial set.
- **Nuxt cases.** The Nuxt fixture (`route-nuxt-app/.output`) is copyable too, but its `route-heavy-initial-chunk`
  path is the same heuristic over a client manifest; the deterministic signal is identical to the Next cases
  built here, so Nuxt cases were omitted to avoid redundant coverage rather than because they are unbuildable.
  The honest Nuxt-specific divergence (per-route strategy comes from config, not the build) is already covered
  by `verification/tools/route-attribution.test.mjs`; it is not a bundle-weight FP/FN concern.
- **The gzip knife-edge is the tool's own 150 KB cutoff.** Case 03 agrees with the tool at 149.8 KB because
  that is the honest human call at that exact size; it is not tuned to flatter the tool. 0.2 KB more raw
  entropy would flip the finding on, which is documented in that case's `source_of_truth`.
