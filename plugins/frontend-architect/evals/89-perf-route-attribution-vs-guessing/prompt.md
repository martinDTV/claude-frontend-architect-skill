---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "User asks which route ships the most JavaScript and whether Three.js is in the initial bundle, with a built Next app available"
expected_outcome: "Use route-attribution on the real build for per-route initial JS and whether three is in the initial set; name it as build-associated, not transferred; do not guess from package size"
tags: ["activation:architect", "domain:performance", "domain:bundles"]
---
We have a built Next.js app. Which route ships the most initial JavaScript, and is Three.js actually in the initial bundle of our 3D route or is it lazy-loaded? How would you find out rather than guess?
