---
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill]
description: "Database-only question about choosing a PostgreSQL index; no frontend skill should fire"
expected_outcome: "An index recommendation with reasoning; frontend skills not invoked"
tags: ["activation:none", "suite:activation", "suite:smoke"]
---
A PostgreSQL table `appointments` has 40 million rows. The hottest query filters by `clinic_id` and a date range on `starts_at` and sorts by `starts_at`. Which index should I create and why?
