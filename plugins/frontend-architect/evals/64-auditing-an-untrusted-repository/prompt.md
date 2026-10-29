---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Running the audit scripts on a repository the team does not trust: which mode loads code from the project and which does not"
expected_outcome: "States that the semantic engine loads typescript and vue/compiler-sfc from the project's node_modules (code execution), that --engine lexical loads nothing, and that --typescript pointing at a trusted install is the middle ground; never claims isolation"
tags: ["activation:architect", "domain:security", "domain:audit"]
---

A client sent us a zipped Nuxt repository, `node_modules` included, for a one-off architecture review. Our security policy says we must not execute anything from it on our machines. Someone proposes running the plugin's audit scripts with the default settings "because they are read-only". Is that compatible with the policy? Which modes of the scripts load code from the repository, which do not, and what would a reasonable setup look like? There is no repository available in this session: answer from this description.
