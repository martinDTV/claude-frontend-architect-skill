---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Excluding an infrastructure sub-package from the audit without hiding findings, and a bundle report that doubled because the output directory held two builds"
expected_outcome: "Explicit, validated and reported exclusions; bundle totals scoped to the current build manifest with stale artifacts reported separately; never sums two builds"
tags: ["activation:architect", "domain:audit", "domain:performance", "domain:delivery"]
---

Two problems with our Nuxt 4 audit. First, the repository contains an `infra/` CDK package with its own `package.json` and no `node_modules`; its imports show up as unresolved in every report and a teammate wants them "filtered out quietly". Second, after two builds in the same afternoon the bundle report said total JavaScript went from about 1.4 MB gzip to about 2.9 MB gzip with the entry unchanged; `.output/public/_nuxt` turned out to contain the chunks of both builds. How should exclusions work so nothing is hidden silently, and how should a bundle measurement decide what belongs to the current build? There is no repository available in this session: answer from this description.
