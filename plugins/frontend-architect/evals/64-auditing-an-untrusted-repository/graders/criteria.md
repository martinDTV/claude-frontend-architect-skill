---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- States plainly that the default (`--engine auto`) semantic mode loads `typescript` and `vue/compiler-sfc` from the audited project's `node_modules` into the tool's process, which executes those packages' code (and their dependencies); it is read-only toward the files, but it is not isolated execution, so it conflicts with a "run nothing from it" policy
- Names `--engine lexical` as the mode that loads nothing from the project (regex analysis over the files only) and describes what it loses (tsconfig aliases, barrels, type-only distinction, template-literal and `<component is>` resolution)
- Names the middle ground: `--typescript <dir> --vue-compiler <dir>` pointing at a TypeScript and Vue compiler installation the team controls, so the project's packages are never loaded while the semantic engine still parses the project's files; the reports then show where the compilers were loaded from
- Adds the operational safeguards that fit the policy: run in a disposable environment, keep `node_modules` of the zip out of any `PATH` or module resolution, do not run its npm scripts, builds or `nuxt prepare`, and treat `.nuxt` metadata as data to read, not code to run
- Does not describe `createRequire` or the scripts as a sandbox

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Says the default mode is safe for untrusted code because the scripts "only read files"
- Claims any mode isolates or sandboxes the project's packages
- Recommends installing the project's dependencies fresh on the reviewer's machine as the fix
- Refuses the review altogether instead of describing the lexical and trusted-compiler options
