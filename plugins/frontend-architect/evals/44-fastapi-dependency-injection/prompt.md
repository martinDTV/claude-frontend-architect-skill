---
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill]
description: "Backend-only question about FastAPI dependency injection; no frontend skill should fire"
expected_outcome: "A FastAPI answer about Depends and scopes without frontend architecture advice; frontend skills not invoked"
tags: ["activation:none", "suite:activation", "suite:smoke"]
---
In a FastAPI service, how should I structure dependency injection for a database session and the current user so that request-scoped dependencies are not shared between requests, and how do I override them in tests?
