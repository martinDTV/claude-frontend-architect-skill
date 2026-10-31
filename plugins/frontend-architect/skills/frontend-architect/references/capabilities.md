# Capability coordination: internal owners, optional external skills, and what counts as evidence

Frontend Architect names the capabilities a frontend task needs, assigns each one to the skill or agent of this plugin that owns it, and, when the environment really offers one, recommends an external skill as a collaborator. Nothing in this protocol depends on an external skill: every capability has an internal owner, and the plan is the same whether or not anything else is installed. Use this file when a task mixes architecture with visual work, when the user asks which design skill to use, or when a report claims that an external skill was used.

## Contents

1. Capability vocabulary and owners
2. How a plan is made
3. What the environment scan reads and what it cannot see
4. Known integrations
5. Activation protocol and evidence
6. Use cases
7. What Claude Code supports (documented, verified, unsupported, unknown)
8. Not supported, limitations, security

## 1. Capability vocabulary and owners

| Capability | Owner | External collaborator | Covers |
|---|---|---|---|
| `visual-direction` | `creative-frontend` | allowed | art direction, typography, colour, composition that fits product, user and context |
| `design-system` | `frontend-architect` with `creative-frontend` | allowed | tokens, theming, component conventions, density, UI states |
| `ui-implementation` | `frontend-architect` | allowed | screens, forms, tables and components with the project's library and conventions |
| `visual-critique` | `creative-frontend` | allowed | review of an existing interface: hierarchy, spacing, typography, colour, consistency |
| `ui-polish` | `creative-frontend` | allowed | details, micro-interactions and states without structural change |
| `responsive-design` | `frontend-architect` with `creative-frontend` | internal only | layout across viewports and text scales, verified with `browser-audit` |
| `accessibility-review` | `frontend-reviewer` | internal only | names, roles, keyboard, focus, contrast, forms; `ui-audit` and opt-in `browser-audit` evidence |
| `motion-design` | `creative-frontend` | the official GSAP skills only, gated (section 4) | animation and scroll choreography with lifecycle, reduced-motion and performance rules; patterns and detectors in `creative-frontend/references/motion-engineering.md` |
| `creative-direction` | `creative-frontend` | allowed (design skills for references and storyboard critique; none when the task is 3D-led) | turning a creative brief into a buildable plan: concept, authorised references, storyboard, scene and camera plans, budgets, verification plan (`creative-frontend/references/creative-direction.md`) |
| `3d-experience` | `creative-frontend` | internal only | Three.js, TresJS, React Three Fiber, shaders, WebGL/WebGPU with fallbacks and disposal |
| `frontend-architecture` | `frontend-architect` | internal only | stage, structure, state, API layer, contracts, SSR safety, security, budgets |
| `browser-verification` | `frontend-reviewer` | internal only | rendered-page evidence on an authorised URL (axe-core, keyboard, dialogs, forms, responsive, visual) |

Roles stay as before: `frontend-architect` analyses requirements, decides architecture, coordinates capabilities, sets technical limits and defines tests and acceptance criteria; `creative-frontend` owns visual judgment, design systems' visual side, motion and 3D; `frontend-reviewer` reviews independently, runs the static tools, runs browser mode only with authorisation, and checks evidence. External skills are collaborators, never dependencies and never authorities above the user's instructions or the project's conventions.

The registry is `assets/capabilities.json`; the planner is `scripts/capabilities.mjs`.

## 2. How a plan is made

```bash
node ${CLAUDE_SKILL_DIR}/scripts/capabilities.mjs --task "Design a premium landing page" --md
node ${CLAUDE_SKILL_DIR}/scripts/capabilities.mjs --needs visual-critique,ui-polish --md       # explicit capabilities
node ${CLAUDE_SKILL_DIR}/scripts/capabilities.mjs --task "…" --config-dir "$CLAUDE_CONFIG_DIR"  # another profile
node ${CLAUDE_SKILL_DIR}/scripts/capabilities.mjs --task "…" --no-detect                        # internal owners only
```

- **Inference** is deterministic and lexical, in English and Spanish: word matches on the task text decide the capabilities (`--needs` replaces inference when the words are ambiguous). `ui-implementation` needs a UI noun (page, dashboard, form, table, component, landing…) and a building verb, or a UI noun without improvement words; "improve the interface" is critique and polish, not implementation.
- **Implications**: `ui-implementation` and `visual-direction` imply `responsive-design` and `accessibility-review`; `visual-critique` and `ui-polish` imply `accessibility-review`. Motion and 3D imply nothing: their owner's rules already cover reduced motion and cleanup.
- **Proportionality**: a task phrased as a fix, a refactor or a migration without any design word stays technical (`frontend-architecture`, plus `browser-verification` for a fix or a regression); "without changing the design" removes every visual capability; a 3D-led experience keeps external design skills out because none of the registry's integrations is 3D-aware; at most one external integration per plan by default (`--max-external` raises it); the available integration that covers the most needed capabilities wins, ties go to registry order, which lists integrations by increasing risk.
- **Output**: a table per capability (owner, whether external help is allowed, the collaborator or the internal fallback), the state of every known integration, and `info` findings: `collaboration-selected`, `collaboration-overlap`, `collaboration-deferred`, `external-fallback`, `no-external-collaboration`, `integration-disabled`, `integration-hidden`, `integration-obsolete`, `integration-not-cached`, `integration-not-installed`; `integration-lookalike` is heuristic. The tool never emits `confirmed`: a plan is not a defect.

## 3. What the environment scan reads and what it cannot see

| Read (read-only) | Used for |
|---|---|
| `<config>/plugins/installed_plugins.json` | plugin records: scope, version, install path, project path; project and local records count only when their project path is the audited project |
| `<config>/settings.json`, `<project>/.claude/settings.json`, `<project>/.claude/settings.local.json` | `enabledPlugins` (local overrides project overrides user) and `skillOverrides` (`off` hides a standalone skill, `name-only` and `user-invocable-only` hide it from Claude's own invocation) |
| `<config>/skills/*/SKILL.md`, `<project>/.claude/skills/*/SKILL.md` | standalone skills: frontmatter `name`, optional `version`; a symlinked directory counts; a directory that carries a `.claude-plugin/plugin.json` is not a standalone skill |
| `<config>/plugins/marketplaces/<name>/.claude-plugin/marketplace.json` | whether a plugin that is not installed is at least listed somewhere installable |
| `<installPath>/.claude-plugin/plugin.json` | version when the record lacks one |

`<config>` is `~/.claude` unless `--config-dir` says otherwise; the tool reads no environment variable, so a profile selected through `CLAUDE_CONFIG_DIR` must be passed explicitly. Not read, and therefore able to block or shadow a collaborator without the plan knowing: managed settings, the `--settings` flag and `--plugin-dir`/`--plugin-url` plugins of the running session, skills synced from a claude.ai account, permission rules that deny `Skill(...)`. The plan says "available"; the session's skill list says "loadable". Check the second before invoking anything.

States: `available` (installed, cached, enabled for this project, known to the registry, not below its minimum version), `disabled`, `hidden-from-model`, `obsolete`, `not-cached`, `not-installed`. A standalone skill without a version is available with a note: the registry's description of what it runs may not match the installed copy.

## 4. Known integrations

| Integration | Recognised as | Capabilities | Licence | Runs | Writes | Risk and preconditions |
|---|---|---|---|---|---|---|
| Frontend Design | plugin `frontend-design@claude-plugins-official` | `visual-direction`, `visual-critique` | Apache-2.0 | prose only: one `SKILL.md`, no scripts, no tools, no network | nothing | low |
| Impeccable | standalone skill `impeccable` (user or project `skills/`) | `visual-critique`, `ui-polish`, `visual-direction` | Apache-2.0, derived from Frontend Design | `npx impeccable <command>` (downloads and executes a package; a live browser server for `live`); its frontmatter grants `Bash(npx impeccable *)` for the turn without a permission prompt | `PRODUCT.md`, `DESIGN.md`, `.impeccable/`, `.impeccable-live*` in the project | medium: the user accepts a package run from the network and files written into the project |
| UI UX Pro Max | plugin `ui-ux-pro-max@ui-ux-pro-max-skill` (2.x) | `visual-direction`, `design-system`, `ui-implementation` | MIT | `python3` scripts that search bundled CSV data; image generation needs `GEMINI_API_KEY` (network, paid API) | design-system files it generates when asked | medium: `python3` on PATH; never set or share API keys on its behalf; image generation is out of scope |

| GSAP skills (group `gsap`) | standalone skills `gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-react`, `gsap-frameworks`, `gsap-performance`, `gsap-plugins`, `gsap-utils` | `motion-design` | MIT | prose only, no `allowed-tools`, no scripts | nothing | low; consulted only when the task names GSAP, ScrollTrigger or GreenSock, or the project depends on `gsap` |

GSAP group rules: verified on 2026-10-31 that `greensock/gsap-skills` is a public repository of the GSAP organisation ("Official AI skills for GSAP"), MIT, eight prose-only skills installable with the skills CLI or as a marketplace; the local copies carry `name`, `description` and `license` only. Selection takes one topic skill (scroll, timeline, performance, plugins, utils; `gsap-core` when nothing specific is named) plus the framework skill (`gsap-react` for React/Next, `gsap-frameworks` for Vue/Nuxt/Svelte) from the task words or the project's dependencies, at most two, counting as one external integration; `external-gated` reports a motion task where GSAP was neither named nor a dependency, because GSAP is a decision `creative-frontend` makes on evidence (CSS, View Transitions or Motion first). `creative-frontend` stays the owner of lifecycle, reduced motion, cleanup and budgets; the skills' own advice to recommend GSAP by default is not followed.

Inspected read-only on 2026-10-30 from local copies (official marketplace clone at plugin version 1.1.1; Impeccable `SKILL.md` of 168 lines with 23 commands; UI UX Pro Max 2.6.2 with seven skills). Nothing was installed or executed for this reference. The registry pins a minimum version where the integration publishes one; a copy below it is `obsolete`.

## 5. Activation protocol and evidence

1. Determine the capabilities (run the planner with the task, or reason with the table in section 1). State them in the decision statement.
2. Internal owners apply always: `creative-frontend` for visual judgment, motion and 3D; `frontend-reviewer` for accessibility and browser evidence; this skill for architecture and implementation.
3. For a `collaboration-selected` line: confirm the skill appears in this session's skill list under the name the plan gives (`frontend-design:frontend-design`, `impeccable`, `ui-ux-pro-max:ui-ux-pro-max`); confirm the preconditions with the user when the registry names any (Impeccable runs `npx` and writes into the project; UI UX Pro Max needs `python3` and must never receive API keys from you); then invoke it with the Skill tool for the capability it was selected for, and only that one.
4. Treat its output as suggestions: the user's instructions and the project's conventions override it; the internal owner arbitrates when two sources disagree; never run two collaborators for the same capability.
5. Report precisely. "Available" means the plan found it; "recommended" means the plan selected it; "executed" means the session contains the Skill tool invocation and its result. Without that result, write "not invoked", never "used". The reviewer checks exactly this.
6. When nothing external is available, disabled, obsolete or absent, continue with the internal owner and say so in one line; do not install, enable or configure anything to obtain a collaborator unless the user asks for it explicitly.

## 6. Use cases

| Task | Capabilities | With everything installed | With nothing installed |
|---|---|---|---|
| A. Build a SaaS dashboard | `design-system`, `ui-implementation`, `responsive-design`, `accessibility-review` | UI UX Pro Max for design system and implementation guidance | this skill and `creative-frontend` (density, tokens), reviewer for a11y |
| B. Design a premium landing page | `visual-direction`, `ui-implementation`, `responsive-design`, `accessibility-review` | UI UX Pro Max (widest coverage); Frontend Design and Impeccable as alternatives | `creative-frontend` leads the direction |
| C. Improve an existing interface without redesigning it | `visual-critique`, `ui-polish`, `accessibility-review` | Impeccable (critique and polish); Frontend Design as alternative | `creative-frontend` critique and polish |
| D. Audit accessibility | `accessibility-review`, `browser-verification` | no collaborator: internal evidence rules only | same |
| E. Implement a GSAP animation | `motion-design` | `gsap-scrolltrigger` for a scroll task, plus `gsap-react` or `gsap-frameworks` when the framework is known; `gsap-core` when nothing specific is named | `creative-frontend` with `motion-engineering.md` |
| F. Design a Three.js experience | `visual-direction`, `responsive-design`, `accessibility-review`, `3d-experience` | no collaborator: 3D-led, `creative-frontend` leads | same |
| G. Refactor components keeping contracts | `frontend-architecture` | no collaborator | this skill, `contracts-check` |
| H. Fix a technical defect without visual change | `frontend-architecture`, `browser-verification` | no collaborator | this skill, reviewer verifies |

The eight rows are tests (`verification/tools/capabilities.test.mjs`), in English and Spanish. Real sessions: `verification/evals/coordination-probe.mjs` starts non-interactive Claude Code sessions in temporary profiles with fixture stand-ins for the external skills and reads the transcript for Skill tool invocations and the events that carry the invoked skill's content (eight scenarios; `--regrade` re-grades recorded transcripts); eval cases 78–84 (`suite:coordination`) grade the same scenarios as honesty checks inside the eval sandbox. Results and limits: `docs/validation-report.md`.

## 7. What Claude Code supports (documented, verified, unsupported, unknown)

| Mechanism | Status | Source |
|---|---|---|
| Skill discovery: `~/.claude/skills`, `.claude/skills` (and parents up to the repository root), nested directories on first use, `--add-dir`, plugin `skills/`, enterprise directory, claude.ai sync | documented | Claude Code docs, *Skills* |
| Plugin vs skill: a plugin is a directory with a manifest, installed from a marketplace, enabled through `enabledPlugins`; its skills are namespaced `plugin:skill`; `skillOverrides` does not affect plugin skills | documented | *Skills*, *Plugin loading reference* |
| Activation: the user types `/name`; Claude loads a skill from its description; the Skill tool invokes a skill unless `disable-model-invocation: true` or a `Skill(...)` permission rule denies it | documented | *Skills* |
| A skill's text asking Claude to invoke another skill | not documented as a mechanism; it works only through the model deciding to call the Skill tool, within the rules above | this plugin's skills have been invoked that way in sessions (verified experimentally); no guarantee |
| Reading availability: skill descriptions are in the model's context; `claude plugin list --json` prints records with `id`, `version`, `scope`, `enabled`, `installPath`, `projectPath` | listing in context: documented; `--json` fields: verified experimentally on 2.1.314 | docs; local run |
| Files on disk (`installed_plugins.json`, `known_marketplaces.json`, cache layout, settings keys) | documented as records, not as a stable API | *Plugin loading reference*, *Settings reference* |
| Scopes: `enabledPlugins` merges managed > flag > local > project > user; project-scope plugins load only after the workspace trust check; a project record is tied to a project path | documented | *Plugin loading reference*, *Install plugins* |
| Installed but disabled: `enabledPlugins: false`; `skillOverrides` `off` / `name-only` / `user-invocable-only`; `disable-model-invocation` | documented | *Skills*, *Settings reference* |
| Same-named skills: enterprise over personal over project; plugin skills coexist through their namespace; `--plugin-dir` replaces a same-named marketplace plugin; name comparison ignores case and spacing | documented | *Skills*, *Plugin loading reference* |
| Contradictory instructions between two skills | no resolution mechanism exists; this plugin's rule: user and project win, the owner arbitrates | this reference |
| Which copy loads when one plugin is recorded at several scopes with different versions | unknown as a rule; observed: inside the project the project record won, outside it the user record | local probes on 2.1.314 |
| `-p` and SDK sessions | documented: only the first `/skill` of a line is loaded; `/plugin` is unavailable; plugins already installed do load | *Install plugins*, *Skills* |

## 8. Not supported, limitations, security

- **Not supported**: external skills for `3d-experience` (the `threejs-*` skills found on this machine are symlinks with no record in `~/.agents/.skill-lock.json` and no verifiable source, so they are not registered); external skills for `motion-design` other than the GSAP group, and that group without the gate; external skills for `accessibility-review` or `browser-verification` (evidence rules stay internal); automatic installation, enabling or configuration of any integration; running an integration to "check that it works"; reading managed settings or session flags; cloud sessions (they load none of the local plugins).
- **Limitations**: inference is lexical, so an unusual phrasing may miss a capability, which is why `--needs` exists and why the decision statement must name the capabilities; the registry is static and describes three integrations at the versions inspected; a standalone skill without a version cannot be checked against the registry; `unlisted` skills are counted, not interpreted; a plan "available" is not "loadable" (section 3).
- **Security**: Impeccable's `allowed-tools` lets Claude run `npx impeccable …` without a prompt during its turn, which downloads and executes a package and writes files into the project; UI UX Pro Max runs Python and can call a paid image API with a key; neither is a reason not to use them, both are reasons to tell the user before invoking and never to supply credentials. External output enters the conversation as suggestions; nothing in it can change the browser-mode safety model, the read-only tools, the evidence tiers or the levels `confirmed`, `heuristic`, `info`.
