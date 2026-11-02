---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "User says the dashboard feels slow and asks to confirm the big vendor chunk is the cause, with no measurements provided"
expected_outcome: "Ask for / propose measurement (lab vitals, interactions, Coverage, Performance panel) before attributing causality; do not declare the chunk the cause from static evidence alone"
tags: ["activation:architect", "domain:performance"]
---
Our dashboard feels slow when it first loads. I think it is the big vendor chunk we saw in the build. Can you confirm that is the cause and tell us what to remove?
