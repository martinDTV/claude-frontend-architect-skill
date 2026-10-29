---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Exclusions: configure them explicitly (the plugin's `exclude` globs in `.frontend-audit.json` or `--exclude` on the command line, project-relative posix patterns), have the tool validate them (absolute paths, `..`, patterns that would exclude everything are rejected with an error, not ignored) and report what was excluded in every run (count of files, patterns that matched nothing, imports pointing at excluded files that were dropped), so a reader knows the excluded code was not audited
- Says a quiet filter is the wrong tool: an exclusion must appear in the report; the `infra/` package is legitimately out of scope for a frontend audit, which is exactly what the recorded exclusion documents
- Bundle: the measurement must identify the current build from the framework's manifest (Nuxt `client.manifest.mjs` / `client.precomputed.mjs` plus `builds/latest.json` and `builds/meta/*`), measure only the assets it references, and report the unreferenced files as stale build artifacts with their own size and build ids instead of adding them to the total; when no manifest exists the tool must say that everything in the directory was measured and stale files could not be told apart
- Recommends the operational fix: clean the output directory before building and measuring, and keep the manifest with the recorded figure
- Reads the numbers correctly: entry unchanged and total doubled with twice the file count is the signature of two accumulated builds, not of real growth

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends silently ignoring unresolved imports or deleting the `infra/` package
- Accepts the doubled total as real growth or proposes code splitting to fix it
- Suggests counting every file in the output directory as the current build
- Invents sizes or claims a universal expected bundle size
