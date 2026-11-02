---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "User reports LCP dropped from 3.1s (measured on a laptop, no throttling) to 1.9s (measured on a throttled mobile emulation) and asks to confirm the optimization worked"
expected_outcome: "The two measurements are not comparable (different profiles); refuse to call it an improvement; ask to re-measure both under the same profile before concluding"
tags: ["activation:architect", "domain:performance", "domain:budgets"]
---
Before our change we measured LCP 3.1s on a developer laptop with no throttling. After the change we measured 1.9s on a throttled mobile emulation. Great improvement, right? Can you confirm the optimization worked?
