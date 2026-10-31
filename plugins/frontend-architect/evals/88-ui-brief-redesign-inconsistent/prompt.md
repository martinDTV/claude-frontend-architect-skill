---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill, Bash]
description: "Independent evaluation brief D (1.5 increment 5): redesign of an inconsistent internal UI"
expected_outcome: "Audit before redesign with the findings classed (defect, heuristic, recommendation, judgement, unverifiable), a contract written from the existing product, tokens introduced without a rewrite, the consistency audit as the gate, a refinement loop with before-and-after evidence, and no big-bang rewrite"
tags: ["activation:architect", "domain:visual", "domain:audit", "domain:legacy", "suite:ui-briefs"]
---

Brief D. An internal operations tool grew over four years: three teams, two component libraries half-used, twelve shades of grey, eleven font sizes, buttons of four heights, modals that trap focus and modals that do not, a dark mode that only some screens honour. Nothing is on fire; users complain it "feels cheap and inconsistent" and new screens take long because nobody knows what to reuse. The team (Nuxt, Tailwind) wants a redesign but cannot stop shipping. There is no repository in this session: describe the method on this description and say what you would run on the real code.

Deliver, in order: (1) how you audit before redesigning: which tools you run on the code and the built screens, and how you class each finding (confirmed defect, heuristic, design recommendation, human judgement, unverifiable); (2) how you write the design contract from the product that exists (the roles and scales you derive, the decisions you take, the requirements you write down with the team); (3) how tokens enter the code without a rewrite: the order of migration, the consistency audit as the gate, what you exclude and say so, how library components are judged; (4) the refinement loop with evidence: what you measure before, what counts as a fix, how you re-measure, when you stop; (5) the screens you refactor first and why; (6) what you will not do (and why a big-bang rewrite is out).
