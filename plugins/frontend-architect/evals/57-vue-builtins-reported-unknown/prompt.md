---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A component audit lists component, transition and keep-alive as unknown components; what they are and what a real unknown component looks like"
expected_outcome: "Explains Vue special elements and built-ins, that the names are normalised and classified as builtin, and that only names resolving nowhere are unknown"
tags: ["activation:architect", "domain:vue-nuxt", "domain:audit"]
---

Our dependency report for a Nuxt 4 app lists these "unknown components": `component` (5 files), `transition` (2 files), `keep-alive` (1 file), `Teleport` (1 file) and `TotallyMissing` (1 file, in `components/ui/Dynamic.vue`). A teammate wants to register `component` and `transition` globally "so the warning goes away", and another one says the whole unknown list is noise and should be ignored. What are these names, which of them deserve attention, and how should a component audit classify what it sees in templates? There is no repository available in this session: answer from this description.
