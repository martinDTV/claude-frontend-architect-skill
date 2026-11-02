---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A perf-budget run reports a route PASS, another FAIL, and LCP UNAVAILABLE because the browser check did not run; the user asks if the app is within budget"
expected_outcome: "Explain that UNAVAILABLE is not a pass and not zero; the app is not confirmed within budget while a required metric was not measured; run the producing check (enough runs) before concluding"
tags: ["activation:architect", "domain:performance", "domain:budgets"]
---
Our perf-budget evaluation shows one route PASS, one route FAIL on initial JS, and LCP as UNAVAILABLE because we did not run the browser vitals check this time. Are we within our performance budget or not?
