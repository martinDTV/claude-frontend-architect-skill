---
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill]
description: "Standalone Python CSV processing script request; no frontend skill should fire"
expected_outcome: "A correct Python script with error handling; frontend skills not invoked"
tags: ["activation:none", "suite:activation"]
---
Write a Python 3.12 script that reads a CSV of transactions (date, account, amount), validates each row, aggregates totals per account per month, and writes the result to another CSV. Handle malformed rows without crashing.
