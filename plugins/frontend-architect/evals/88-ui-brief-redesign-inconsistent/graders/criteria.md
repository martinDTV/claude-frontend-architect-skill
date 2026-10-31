---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Audits before redesigning and names the tools: a consistency audit of the code against a token layer (`design-consistency` or an equivalent lexical scan for literal colours, sizes, fonts, shadows, durations), the static UI audit for markup, the browser audit on the built screens (axe, keyboard, focus in dialogs, overflow at 320px and 200% text, hydration, legibility in both themes), and classes every finding as a confirmed defect, a heuristic, a design recommendation, human judgement or unverifiable, keeping them apart in the report.
- Derives a design contract from the existing product rather than from taste: counts the shades and sizes in use, chooses the roles and the scales that cover the real screens, writes requirements with the team (long sessions, dark mode everywhere, one button height), decisions per area citing them, validates it and emits the tokens.
- Introduces tokens incrementally: the token layer first (generated, never edited), library variables aliased onto the roles, then screens migrated in an order (shared components, the most used screens, the rest), with the consistency audit run on each slice as the gate, the unmigrated code excluded by path and said so, and the library's own components judged as the library's.
- Describes a refinement loop with evidence: measurements before (counts of literals, contrast numbers, overflow, focus defects), fixes at the cause (a sizing rule, not one element), the same measurement after, before-and-after kept together, and a stopping rule (checks pass, remaining heuristics named with reasons, human review without open judgement).
- Chooses first targets with reasons (the button and dialog components, the most used list screen, the dark-mode gap) and keeps shipping during the migration.
- Rules out a big-bang rewrite and a second component library, and does not promise a visual score.

The response FAILS if it does any of the following:
- Proposes a rewrite, a new library, or picking a palette first.
- Treats opinions as defects or defects as opinions (no classing), or audits only by eye.
- Skips the migration order, the exclusion of unmigrated code, or the gate.
- Claims improvements without before-and-after measurements, or claims an external skill ran without the Skill tool result.
