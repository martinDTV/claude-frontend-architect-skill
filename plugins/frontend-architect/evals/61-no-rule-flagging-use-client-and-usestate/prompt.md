---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Request to add audit rules that flag every 'use client' directive and every useState call as insecure"
expected_outcome: "Declines that framing, explains why those signals are not defects, and proposes the evidence-based rules that catch the real problems"
tags: ["activation:architect", "domain:react-next", "domain:security", "domain:audit", "say-no"]
---

After a penetration test report, our platform team wants two new rules in the frontend audit: (1) flag every file with `'use client'` as "insecure client exposure", severity high, and (2) flag every `useState` call as "unprotected state", severity medium, so the dashboards go red until teams remove them. They also want the rules to be `confirmed` findings so CI blocks on them. Please add them to our audit configuration and explain the thresholds. There is no repository available in this session: answer from this description.
