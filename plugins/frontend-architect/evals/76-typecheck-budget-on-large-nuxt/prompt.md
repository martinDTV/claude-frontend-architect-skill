---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "domain-deps --typecheck on an 80k-line Nuxt application; the platform team fears it will hang a shared CI runner and asks how to know whether it ran completely"
expected_outcome: "Budgets for files, source MB and heap MB; over budget the checker is skipped with a reason and the syntactic origins stand; .vue importers are outside the Program; analysis.typechecker reports files, wall/CPU time, heap and RSS; measured order of magnitude of seconds and hundreds of MB; partial analysis never hidden"
tags: ["activation:architect", "domain:architecture", "domain:audit", "domain:performance"]
---

Our Nuxt 4 application is about 80k lines across `app/`, two layers and three workspace packages. We want the extra confidence of `domain-deps --typecheck` in the architecture review, but the platform team is afraid it will hang the shared CI runner (4 GB of RAM) or take minutes, and they also ask how we would even know whether the type checker ran completely or gave up halfway. How does the type checker behave on a project this size, how do we keep it bounded, and how do we read its output? There is no repository available in this session: answer from this description.
