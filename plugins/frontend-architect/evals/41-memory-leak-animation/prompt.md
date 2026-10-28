---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Vue component with GSAP, resize listener, polling and a Three.js preview grows to 1.5 GB after navigating"
expected_outcome: "Missing cleanups named (context revert, listener removal, interval clear, Three disposal and loop stop) with tests and a leak procedure"
tags: ["activation:both", "domain:visual", "domain:testing", "domain:performance"]
---
A Vue component animates a list with GSAP on mount, listens to window resize, polls an endpoint every 5 s, and renders a Three.js preview. After navigating around for ten minutes the tab uses 1.5 GB. Find the likely causes and show the fixes with tests.
