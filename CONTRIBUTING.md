# Contributing

Thanks for helping. This plugin's value comes from being **correct and current**, so contributions follow three rules.

## 1. Verify before you write

- Check APIs against the official docs and the installed package version, not memory.
- Any non-trivial code example in a reference must be verifiable: start the fenced block with a marker so `verification/extract.mjs` compiles it.
  - `// @verify vue,react:lib/http/errors.ts` (path relative to the project's source root: `src/` for vue, react, next and creative; `app/` for nuxt)
  - `// @verify nuxt:/nuxt.config.ts` (leading slash: project root)
  - `<!-- @verify nuxt:components/X.vue -->` for SFCs
- Run `./verification/run-all.sh` and include the result in the PR. If a check cannot run in your environment, say so.
- `node verification/plugin-check.mjs` must pass: it fails on manifests out of sync, references not linked from `SKILL.md` (or linked but missing), dangling cross-references between references, scripts not documented or not executable, and malformed eval cases.

## 2. Decisions over catalogs

Add guidance that changes a decision ("use X when…, not when…"), not lists of APIs that the official docs already cover. Prefer pointing to companion skills for deep API detail.

## 3. Audit scripts

The scripts in `plugins/frontend-architect/skills/frontend-architect/scripts/` ship with the plugin. Rules for changing them:

- Node 18+, ESM, **no npm dependencies**, read-only (the only write is `contracts-check.mjs --write-baseline`). They never install, build or execute project code.
- Every finding carries a level: `confirmed` only when the pattern is literally present (an import, a literal key, a measured number); `heuristic` for anything resolved lexically (auto-imports, cleanup detection, auth checks); `info` for inventory. When in doubt, `heuristic`.
- Add or extend a fixture under `verification/tools/fixtures/` and a `node:test` case under `verification/tools/` for every new check, including a negative case (the pattern done right must not be reported). Run `node --test verification/tools/*.test.mjs`.
- Before shipping, run the tool read-only against at least one real application and look at the false positives; tighten the pattern or downgrade the level rather than adding exceptions nobody understands.
- Document flags and findings in `scripts/README.md` and the `Run when` row in `SKILL.md`.

## 4. Keep context cheap

- `SKILL.md` files stay under 500 lines (CI enforces it) and only route to references.
- References get a table of contents when longer than ~100 lines, and stay one level deep.
- Do not add agents or skills unless they have a distinct trigger or need context isolation; document why in `docs/architecture.md`.

## Evals

Add or update a scenario in `plugins/frontend-architect/evals/<nn-name>/` (`prompt.md` + `graders/criteria.md`, or a `case.yaml` with `scaffold_script` when the agent must inspect files) for every behavioral change, including negative criteria (over-engineering, wrong tool, unsafe pattern) and, where the right answer is "no", a case that says so. Run with `claude plugin eval ./plugins/frontend-architect` using your own account; cases that run the scripts need `--allow-tools Bash`. `plugin-check.mjs` validates the case structure offline.

## Third-party content

Do not copy text or code from other skills or docs. Link to them and summarize in your own words. Respect licenses; record new complementary projects in `docs/research.md` with verified license and maintenance data.

## Releases

1. Update `references/ecosystem-status.md` and `docs/research.md` if versions changed.
2. Bump `version` in `.claude-plugin/marketplace.json` and `plugins/frontend-architect/.claude-plugin/plugin.json` (semver: major for removed or reversed guidance, minor for new guidance, patch for fixes).
3. Update `CHANGELOG.md`.
4. Run `claude plugin validate .` and `./verification/run-all.sh`.
