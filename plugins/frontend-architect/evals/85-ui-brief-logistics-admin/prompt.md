---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill, Bash]
description: "Independent evaluation brief A (1.5 increment 5): a logistics admin panel from a written brief"
expected_outcome: "A design contract before screens, a stage-1 feature architecture, the enterprise patterns (five-state regions, URL table state, named row actions, forms that recover, preferences, keyboard, cards under 768px), the verification plan with its classes, and proportionality: no 3D, no palette engine, no microfrontends"
tags: ["activation:architect", "domain:visual", "domain:nuxt-vue", "domain:audit", "suite:ui-briefs"]
---

Brief A. A regional carrier needs the back office its dispatchers use all day: shipments (about four hundred live at a time), vehicles, drivers, exceptions. Dispatchers sit at desks on 1440px monitors; supervisors check it on a phone in the yard. They must filter and sort shipments, assign drivers, mark deliveries, cancel with care, plan new shipments with a form, keep their own density and columns, and read it for an eight-hour shift in a warm, dim office. The team knows Nuxt and wants Nuxt UI. There is no repository yet: answer from this brief.

Deliver, in order: (1) the visual direction as a design contract (audience, requirements with ids, a direction statement, one decision per area citing the requirements, the type scale, spacing, roles for light and dark) and which tool validates it; (2) the architecture stage and folder layout with the reasons, naming what you leave out; (3) the screens and their behaviours: shell, dashboard, shipments table, row actions, the form, preferences, with the states of every data region and how each is reachable; (4) how it stays usable on the phone and at 200% text; (5) the verification plan: which findings a tool proves, which it only flags, which need a person, and the evidence each check leaves; (6) proportionality: the things this brief does not need and why. Name the skill references you relied on.
