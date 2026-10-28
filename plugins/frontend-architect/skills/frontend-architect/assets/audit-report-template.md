# Frontend architecture audit: <product or app name>

**Date:** YYYY-MM-DD · **Repository and ref:** `<repo>` (`<branch>` at `<sha>`, tree clean/dirty) · **Scope:** read-only; no code, dependencies, pipelines or deployments were modified · **Question:** <the one sentence this audit answers>

> **Short answer.** <Two to four sentences: the recommendation, the main reason, what is deliberately not recommended and why.>

---

## 0. Executive summary

**What was audited.** <Files and lines, config, pipelines, infrastructure definitions, related apps, git history, which tools and agents were run.>

**Facts** (five to seven, each demonstrated or measured):
1. <Organization: commits per author per area, teams, CODEOWNERS, release cadence.>
2. <Shape of the code: stage, grouping, boundaries, auto-import discipline.>
3. <Coupling: horizontal edges, hotspots, misnamed core modules.>
4. <Shell and session core: what depends on what.>
5. <State mechanisms and the cleanup gaps.>
6. <Tests, build and deploy paths.>
7. <Bundle and performance measurements, if a build exists.>

**Recommendation.** <One line pointing to sections 6, 8, 10 and 12.>

## 1. Inventory

### 1.1 Platform and versions (from `node_modules`, not from memory)
| Piece | Installed | Note |
|---|---|---|

### 1.2 Size and shape
| Folder | Files | Lines | Observation |
|---|---|---|---|

### 1.3 Routes, layouts and navigation
<Pages, guards, layouts, how menus are derived; output of `routes-audit.mjs`.>

### 1.4 Identity, session, tenant and permissions
<Session model, token storage, refresh, logout protocol, tenant resolution, permission source.>

### 1.5 API layer
<Clients and instances, services, validation, cancellation, error contract.>

### 1.6 State
<Stores and their consumers, `useState` keys, module-level state, storage writes; output of `state-audit.mjs`.>

### 1.7 UI
<Library and version, hand-built tables/forms/dialogs, states coverage, accessibility signals, charts and motion.>

### 1.8 Build, tests and delivery
<CI steps, test counts, deploy paths, configuration strategy, bundle numbers from `bundle-budget.mjs`.>

### 1.9 Organization and ownership
<`git shortlog` per area, teams, PR cadence, documents that define the delivery model.>

## 2. Dependency map

### 2.1 Method
<Classification used (attach the `.frontend-audit.json`), what counts as an edge (explicit import, auto-import symbol, template component), tool and version, date.>

### 2.2 Matrix
<From `domain-deps.mjs --md`; rows depend on columns; bold the horizontal cells that matter.>

### 2.3 Horizontal edges explained
| Flow | Edges | What it really is |
|---|---|---|

### 2.4 Shell and hub dependencies
<What layouts, middleware, plugins and aggregator pages take from domains.>

### 2.5 De facto shared core
<Files used by most domains: candidates for a base package.>

## 3. Demonstrated problems and hypothetical risks

### 3.1 Demonstrated, high impact
| # | Problem | Evidence (`path:line`) | Why it matters for the decision |
|---|---|---|---|

### 3.2 Demonstrated, medium impact
| # | Problem | Evidence |
|---|---|---|

### 3.3 Hypothetical risks (condition stated; not counted as problems)
- **H1** <Risk> — materializes if <condition>.

### 3.4 What is good and should not change
- <Strength with evidence.>

## 4. Options compared
| | A. Reinforced modular monolith | B. Shared base package | C. Microfrontends | D. Route-based apps |
|---|---|---|---|---|
| Team fit | | | | |
| Delivery independence | | | | |
| Risk | | | | |
| Cost now / later | | | | |
| Needs first | | | | |

## 5. Framework and ecosystem facts that condition the decision
<Verified support status of the techniques considered (sources and dates), version constraints, known limitations.>

## 6. Recommended target architecture
### 6.1 Shape of the code
<Tree and the rules that keep it (entries, explicit imports, boundary tooling).>
### 6.2 Delivery and operation
### 6.3 Where the alternatives would enter later
### 6.4 What this architecture deliberately leaves out

## 7. Contracts: modules, communication, security and state
<Boundaries, public entries, how modules communicate (navigation, core, published contracts, backend), how each security and state contract is preserved.>

## 8. Incremental migration plan
| Phase | Scope | Exit criteria | Reversible? |
|---|---|---|---|

## 9. Risks
### 9.1 Of the recommended path
### 9.2 Of the alternatives
### 9.3 Existing today regardless of the option

## 10. Measurable criteria to reopen the decision
| # | Criterion | Threshold | How it is measured |
|---|---|---|---|

## 11. Optional: bounded spike (defined, not authorized)
<Candidate, technique, what it must demonstrate, acceptance, limits and rollback.>

## 12. Proposed ADR
<Use `adr-template.md`; status proposed.>

## Annex A. Method and commands
<Exact commands with versions and dates, environment, classification file, what could not be verified and what it would take.>
