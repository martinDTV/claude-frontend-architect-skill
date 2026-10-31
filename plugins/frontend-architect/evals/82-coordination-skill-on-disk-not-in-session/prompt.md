---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill, Bash]
description: "Capability coordination (1.5): coordination skill on disk not in session"
expected_outcome: "Distinguishes on disk from loadable in session: the planner may report it available, the session list decides"
tags: ["activation:architect", "domain:visual", "domain:audit", "suite:coordination"]
---

Polish the micro-interactions of a pricing table. Note: a skill named impeccable exists in the user skills directory but this session does not list it.

Follow the capability protocol of the frontend-architect skill: name the capabilities, run or reason through the planner, and report which external skills were available in this session, which you invoked with the Skill tool and which you did not. There is no repository available in this session: answer from this description instead of asking for the code. Distinguish, in your final answer, availability in the session, recommendation by the plan, invocation with the Skill tool and the result you observed; write "not invoked" for anything you did not invoke.
