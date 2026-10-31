---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill, Bash]
description: "Capability coordination (1.5): coordination integration disabled"
expected_outcome: "Treats a disabled integration as unavailable: does not invoke it, does not suggest enabling it on its own, says it is disabled for the project and continues with the internal owner."
tags: ["activation:architect", "domain:visual", "domain:audit", "suite:coordination"]
---

Improve the existing interface of a settings screen without a full redesign. Note: the impeccable skill is installed on this machine but disabled for this project.

Follow the capability protocol of the frontend-architect skill: name the capabilities, run or reason through the planner, and report which external skills were available in this session, which you invoked with the Skill tool and which you did not. There is no repository available in this session: answer from this description instead of asking for the code. Distinguish, in your final answer, availability in the session, recommendation by the plan, invocation with the Skill tool and the result you observed; write "not invoked" for anything you did not invoke.
