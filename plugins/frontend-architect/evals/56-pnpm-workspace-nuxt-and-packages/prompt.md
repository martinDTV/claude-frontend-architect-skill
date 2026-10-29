---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Auditing dependencies in a pnpm workspace with a Nuxt app and shared packages that declare exports maps"
expected_outcome: "Runs the tools at the workspace root for cross-package edges, explains exports/subpath resolution and deep imports, and what an app-level run can and cannot see"
tags: ["activation:architect", "domain:architecture", "domain:vue-nuxt", "domain:audit"]
---

We have a pnpm workspace: `apps/web` (Nuxt 4), `packages/ui` (a component library with a `package.json` `exports` map: `"."` and `"./button"`), and `packages/shared` (utilities, `main` pointing at `src/index.ts`). The web app imports `@acme/ui`, `@acme/ui/button` and, in two places, `@acme/ui/src/internal/theme`. When we run the dependency audit from `apps/web` the packages show up as external dependencies and nothing is said about those deep imports. How should we audit this monorepo so that dependencies between the app and the packages are visible, deep imports into unpublished subpaths are caught, and we do not accidentally analyse code outside the repository? There is no repository available in this session: answer from this description.
