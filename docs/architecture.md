# Internal architecture of the plugin

## Layout

```
.claude-plugin/marketplace.json           marketplace catalog (one plugin)
plugins/frontend-architect/
├── .claude-plugin/plugin.json
├── skills/
│   ├── frontend-architect/               core skill
│   │   ├── SKILL.md                      workflow, stages, core decisions, rules, reference index
│   │   ├── references/ (21 files)        loaded on demand
│   │   └── assets/adr-template.md
│   └── creative-frontend/                motion and 3D skill
│       ├── SKILL.md
│       └── references/ (6 files)
├── agents/frontend-reviewer.md           read-only audit subagent
└── evals/ (20 scenarios)                 claude plugin eval suite
verification/                             compiles and tests the documented code (not installed)
docs/                                     research, this document, validation report
```

## Decisions

**Two skills instead of one or many.** Architecture/state/API work and motion/3D work have different triggers and audiences. Separating them keeps the core skill's description precise and avoids loading creative guidance into architecture tasks. A separate `architecture-review` skill was rejected: reviewing is the same knowledge applied differently, so it is a workflow in the core skill plus an agent.

**One agent instead of fifteen.** The brief proposed many specialist agents (nuxt-expert, pinia-specialist, gsap-specialist…). Agents are justified when they need **context isolation** or **different tool permissions**. Only the reviewer qualifies: audits read many files (isolation keeps the main conversation clean) and must not edit (restricted tools). Specialist agents would duplicate reference content and create conflicting instructions; their knowledge lives in references instead.

**Progressive disclosure.** `SKILL.md` files hold the workflow and the decisions that apply to most tasks (~140 lines each). References are one level deep, each with a "read when" entry in the index.

**Companion skills, not copies.** Official GSAP skills, Emil Kowalski's motion skills, Vue/Nuxt and Vercel skills are recommended for deep API detail. No third-party content is redistributed.

**Verified examples.** Code examples carry `@verify` markers; `verification/extract.mjs` writes them into five projects (vue, react, next, nuxt, creative) that run real compilers, tests and builds. This caught real errors during development (an invented Three.js API, an undeclared VueUse dependency).

**Evals in the native format.** `claude plugin eval` discovers `evals/<case>/prompt.md` and `graders/*.md`, runs with and without the plugin, and scores with an LLM judge. Every case includes negative criteria to catch over-engineering and unsafe patterns.

## Namespacing and activation

Skills activate from their `description` when a task matches. Plugin components are namespaced by the plugin name (`frontend-architect`). The agent is selected by Claude from its description or can be requested explicitly ("use the frontend-reviewer agent").
