---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A small content site team proposes microfrontends, a module-federation shell and a custom RUM pipeline to fix a 2.6s LCP, before measuring"
expected_outcome: "Reject the heavy architecture as a performance fix; measure first; the right-sized fixes (image, defer third parties, less JS) come before structural distribution; no RUM platform build to start"
tags: ["activation:architect", "domain:performance", "domain:architecture"]
---
Our marketing content site has a 2.6s LCP. The team wants to split it into microfrontends with a module-federation shell and build a custom real-user-monitoring pipeline to get the performance under control. Should we start there?
