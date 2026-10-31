---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill, Bash]
description: "Capability coordination (1.5): coordination technical task"
expected_outcome: "Keeps the plan technical (frontend architecture, browser verification)"
tags: ["activation:architect", "domain:visual", "domain:audit", "suite:coordination"]
---

Fix a technical defect in a Nuxt page without changing the design: a composable keeps a module-level fetch client shared across requests.

Follow the capability protocol of the frontend-architect skill: name the capabilities, run or reason through the planner, and report which external skills were available in this session, which you invoked with the Skill tool and which you did not. There is no repository available in this session: answer from this description instead of asking for the code. Distinguish, in your final answer, availability in the session, recommendation by the plan, invocation with the Skill tool and the result you observed; write "not invoked" for anything you did not invoke.
