# Contributing

Thanks for helping. This plugin's value comes from being **correct and current**, so contributions follow three rules.

## 1. Verify before you write

- Check APIs against the official docs and the installed package version, not memory.
- Any non-trivial code example in a reference must be verifiable: start the fenced block with a marker so `verification/extract.mjs` compiles it.
  - `// @verify vue,react:lib/http/errors.ts` (path relative to the project's source root: `src/` for vue, react, next and creative; `app/` for nuxt)
  - `// @verify nuxt:/nuxt.config.ts` (leading slash: project root)
  - `<!-- @verify nuxt:components/X.vue -->` for SFCs
- Run `./verification/run-all.sh` and include the result in the PR. If a check cannot run in your environment, say so.

## 2. Decisions over catalogs

Add guidance that changes a decision ("use X when…, not when…"), not lists of APIs that the official docs already cover. Prefer pointing to companion skills for deep API detail.

## 3. Keep context cheap

- `SKILL.md` files stay under 500 lines (CI enforces it) and only route to references.
- References get a table of contents when longer than ~100 lines, and stay one level deep.
- Do not add agents or skills unless they have a distinct trigger or need context isolation; document why in `docs/architecture.md`.

## Evals

Add or update a scenario in `plugins/frontend-architect/evals/<nn-name>/` (`prompt.md` + `graders/criteria.md`) for every behavioral change, including negative criteria (over-engineering, wrong tool, unsafe pattern). Run with `claude plugin eval ./plugins/frontend-architect` using your own account.

## Third-party content

Do not copy text or code from other skills or docs. Link to them and summarize in your own words. Respect licenses; record new complementary projects in `docs/research.md` with verified license and maintenance data.

## Releases

1. Update `references/ecosystem-status.md` and `docs/research.md` if versions changed.
2. Bump `version` in `.claude-plugin/marketplace.json` and `plugins/frontend-architect/.claude-plugin/plugin.json` (semver: major for removed or reversed guidance, minor for new guidance, patch for fixes).
3. Update `CHANGELOG.md`.
4. Run `claude plugin validate .` and `./verification/run-all.sh`.
