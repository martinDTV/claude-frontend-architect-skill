---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Two dependency detectors disagree on a Nuxt component whose only use of an auto-imported helper is inside a template literal and a bound attribute"
expected_outcome: "Explains why an AST-based engine sees the call inside ${...} and a string-stripping regex detector may not, verifies before blaming either tool, and says which output to trust for that file"
tags: ["activation:architect", "domain:vue-nuxt", "domain:audit", "domain:testing"]
---

In our Nuxt 4 app, `components/pre/AlcanceBarra.vue` uses the auto-imported util `contar` exactly once, like this: ``detalle: `${p.cliente} · ${contar(p.contratos.length, 'contrato', 'contratos')}` `` in the script, and a bound attribute in the template does ``:title="`${plural(n, 'tarea', 'tareas')}`"``. The plugin's `domain-deps` report shows edges from that component to `utils/texto.ts`; our in-house detector, which blanks strings before matching identifiers, shows none. The team wants to know which tool is wrong and whether these are real dependencies. There is no repository available in this session: answer from this description.
