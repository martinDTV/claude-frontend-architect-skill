# Evaluation inventory snapshot (1.7 increment 1)

Generated deterministically by `verification/evals/eval-inventory.mjs` (no model, no agent) at plugin SHA `9183066`, metadata 1.6.0. Regenerate with `node verification/evals/eval-inventory.mjs`. This is a description of what each case needs and its recorded state — never a behavioural score.

# Evaluation inventory (95 cases) — deterministic, model-free

Evidence tiers per docs/evaluation-contracts.md. No case is PASS here; this is an inventory of what each case needs and its recorded state.

| # | case | shape | area | activation | tier | graders | Bash | scaffold | state |
|---|------|-------|------|-----------|------|---------|------|----------|-------|
| 1 | 01-small-nuxt-no-pinia | prompt.md | vue-nuxt/state/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 2 | 02-large-nuxt-with-pinia | prompt.md | vue-nuxt/state/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 3 | 03-nuxt-colada-axios | prompt.md | vue-nuxt/state | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 4 | 04-persistent-state | prompt.md | vue-nuxt/state/security | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 5 | 05-next-server-components | prompt.md | react-next/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 6 | 06-next-tanstack-query | prompt.md | react-next/state | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 7 | 07-modular-multi-domain | prompt.md | react-next/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 8 | 08-microfrontends-not-justified | prompt.md | architecture/vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 9 | 09-microfrontends-justified | prompt.md | architecture/security | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 10 | 10-nuxt-next-shared-auth | prompt.md | security | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 11 | 11-gsap-landing | prompt.md | visual/vue-nuxt | creative | E1 | llm,tool_used | - | - | NOT_RUN |
| 12 | 12-tresjs-3d | prompt.md | visual/vue-nuxt/performance | creative | E1 | llm,tool_used | - | - | NOT_RUN |
| 13 | 13-r3f-3d | prompt.md | visual/react-next/performance | creative | E1 | llm,tool_used | - | - | NOT_RUN |
| 14 | 14-nuxt-ui-project | prompt.md | vue-nuxt/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 15 | 15-shadcn-project | prompt.md | react-next/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 16 | 16-accessibility-audit | prompt.md | vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 17 | 17-ssr-issues | prompt.md | vue-nuxt/security/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 18 | 18-security-review | prompt.md | react-next/security | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 19 | 19-performance-analysis | prompt.md | performance/vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 20 | 20-refactor-existing | prompt.md | vue-nuxt/state/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 21 | 21-landing-high-visual | prompt.md | visual | creative | E1 | llm,tool_used | - | - | NOT_RUN |
| 22 | 22-enterprise-dashboard-nuxt | prompt.md | visual/vue-nuxt/state | both | E1 | llm,tool_used,tool_used | - | - | NOT_RUN |
| 23 | 23-modular-erp-nuxt-80k | prompt.md | architecture/vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 24 | 24-medical-saas-multitenant | prompt.md | security/vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 25 | 25-existing-nuxt-spa-ssr-false | prompt.md | vue-nuxt/security/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 26 | 26-nextjs-hydration-bugs | prompt.md | react-next | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 27 | 27-monorepo-decision | prompt.md | architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 28 | 28-microfrontends-nuxt4-module-federation | prompt.md | architecture/vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 29 | 29-design-system-tokens-multi-framework | prompt.md | architecture/visual | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 30 | 30-high-traffic-platform | prompt.md | performance/architecture/vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 31 | 31-complex-form-wizard | prompt.md | vue-nuxt/state | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 32 | 32-charts-dashboard-library | prompt.md | react-next/performance/visual | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 33 | 33-no-global-store-react | prompt.md | react-next/state | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 34 | 34-no-threejs-hover-effect | prompt.md | visual/vue-nuxt | creative | E1 | llm,tool_used | - | - | NOT_RUN |
| 35 | 35-no-framework-migration | prompt.md | architecture/performance | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 36 | 36-legacy-options-api-refactor | prompt.md | vue-nuxt/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 37 | 37-typescript-strict-adoption | prompt.md | vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 38 | 38-i18n-rtl-medical | prompt.md | vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 39 | 39-audit-with-tools | case.yaml | audit/vue-nuxt/security | architect | E1 | llm,tool_used,tool_used | yes | yes | NOT_RUN |
| 40 | 40-session-expiry-race | prompt.md | security/testing/vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 41 | 41-memory-leak-animation | prompt.md | visual/testing/performance | both | E1 | llm,tool_used,tool_used | - | - | NOT_RUN |
| 42 | 42-observability-rum-setup | prompt.md | delivery/performance/react-next | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 43 | 43-deployment-runtime-config | prompt.md | delivery/vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 44 | 44-fastapi-dependency-injection | prompt.md | - | none | E1 | llm,tool_used | - | - | NOT_RUN |
| 45 | 45-postgres-index-choice | prompt.md | - | none | E1 | llm,tool_used | - | - | NOT_RUN |
| 46 | 46-python-csv-script | prompt.md | - | none | E1 | llm,tool_used | - | - | NOT_RUN |
| 47 | 47-terraform-s3-bucket-policy | prompt.md | - | none | E1 | llm,tool_used | - | - | NOT_RUN |
| 48 | 48-nuxt-dashboard-restructure-visual | prompt.md | architecture/visual/vue-nuxt | both | E1 | llm,tool_used,tool_used | - | - | NOT_RUN |
| 49 | 49-hidden-coupling-through-aliases | prompt.md | architecture/vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 50 | 50-nuxt-auto-import-dependency-mapping | prompt.md | architecture/vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 51 | 51-server-only-code-reaching-client | prompt.md | react-next/security/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 52 | 52-vue-sfc-cleanup-false-positive | prompt.md | vue-nuxt/testing/performance | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 53 | 53-ssr-state-and-late-responses-tenant | prompt.md | security/state/vue-nuxt/testing | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 54 | 54-public-contract-breaking-change | prompt.md | architecture/testing | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 55 | 55-symbol-origin-through-barrels | prompt.md | architecture/vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 56 | 56-pnpm-workspace-nuxt-and-packages | prompt.md | architecture/vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 57 | 57-vue-builtins-reported-unknown | prompt.md | vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 58 | 58-dependency-inside-template-literal | prompt.md | vue-nuxt/audit/testing | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 59 | 59-component-mentioned-in-comments-only | prompt.md | vue-nuxt/audit/testing | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 60 | 60-client-only-and-server-only-boundaries | prompt.md | react-next/security/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 61 | 61-no-rule-flagging-use-client-and-usestate | prompt.md | react-next/security/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 62 | 62-dependency-policy-and-allowed-cycles | prompt.md | architecture/vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 63 | 63-choosing-and-reading-the-engine | prompt.md | audit/vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 64 | 64-auditing-an-untrusted-repository | prompt.md | security/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 65 | 65-exclusions-and-stale-build-output | prompt.md | audit/performance/delivery | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 66 | 66-nuxt-module-structure-and-visual-density | prompt.md | architecture/visual/vue-nuxt/state | both | E1 | llm,tool_used,tool_used | - | - | NOT_RUN |
| 67 | 67-static-a11y-audit-with-verification-levels | prompt.md | accessibility/audit/vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 68 | 68-a11y-encapsulated-component-false-positive | prompt.md | accessibility/vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 69 | 69-forms-audit-double-submit-and-pending | prompt.md | forms/vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 70 | 70-browser-mode-authorization-and-production | prompt.md | security/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 71 | 71-responsive-overflow-intentional-scroller | prompt.md | visual/accessibility/vue-nuxt | both | E1 | llm,tool_used,tool_used | - | - | NOT_RUN |
| 72 | 72-visual-regression-baseline-governance | prompt.md | visual/testing/delivery | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 73 | 73-ssr-hydration-window-in-setup | prompt.md | ssr/vue-nuxt/state | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 74 | 74-hydration-false-positive-after-mount | prompt.md | ssr/vue-nuxt | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 75 | 75-routes-middleware-array-with-comments | prompt.md | security/vue-nuxt/audit | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 76 | 76-typecheck-budget-on-large-nuxt | prompt.md | architecture/audit/performance | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 77 | 77-dense-dashboard-accessible-and-responsive | prompt.md | architecture/visual/accessibility/vue-nuxt | both | E1 | llm,tool_used,tool_used | - | - | NOT_RUN |
| 78 | 78-coordination-ui-only-internal | prompt.md | visual/audit | architect | E1 | llm,tool_used,tool_used | yes | - | NOT_RUN |
| 79 | 79-coordination-impeccable-available | prompt.md | visual/audit | architect | E1 | llm,regex,tool_used | yes | - | NOT_RUN |
| 80 | 80-coordination-ui-ux-pro-max-available | prompt.md | visual/audit | architect | E1 | llm,regex,tool_used | yes | - | NOT_RUN |
| 81 | 81-coordination-integration-disabled | prompt.md | visual/audit | architect | E1 | llm,tool_used,tool_used | yes | - | NOT_RUN |
| 82 | 82-coordination-skill-on-disk-not-in-session | prompt.md | visual/audit | architect | E1 | llm,tool_used,tool_used | yes | - | NOT_RUN |
| 83 | 83-coordination-recommendation-with-side-effects | prompt.md | visual/audit | architect | E1 | llm,tool_used,tool_used | yes | - | NOT_RUN |
| 84 | 84-coordination-technical-task | prompt.md | visual/audit | architect | E1 | llm,tool_used,tool_used | yes | - | NOT_RUN |
| 85 | 85-ui-brief-logistics-admin | prompt.md | visual/nuxt-vue/audit | architect | E1 | llm,tool_used | yes | - | NOT_RUN |
| 86 | 86-ui-brief-premium-tech-landing | prompt.md | visual/motion/react-next | architect | E1 | llm,tool_used | yes | - | NOT_RUN |
| 87 | 87-ui-brief-specialty-store | prompt.md | visual/nuxt-vue/state | architect | E1 | llm,tool_used | yes | - | NOT_RUN |
| 88 | 88-ui-brief-redesign-inconsistent | prompt.md | visual/audit/legacy | architect | E1 | llm,tool_used | yes | - | NOT_RUN |
| 89 | 89-perf-route-attribution-vs-guessing | prompt.md | performance/bundles | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 90 | 90-perf-ask-for-measurement-no-invented-cause | prompt.md | performance | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 91 | 91-perf-no-indiscriminate-memoization | prompt.md | performance/react | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 92 | 92-perf-budget-states-unavailable-not-pass | prompt.md | performance/budgets | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 93 | 93-perf-noncomparable-before-after-profiles | prompt.md | performance/budgets | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 94 | 94-perf-optimization-not-demonstrated-overlap | prompt.md | performance/budgets | architect | E1 | llm,tool_used | - | - | NOT_RUN |
| 95 | 95-perf-avoid-over-architecting | prompt.md | performance/architecture | architect | E1 | llm,tool_used | - | - | NOT_RUN |

## Summary
- shape: 1 case.yaml, 94 prompt.md
- tier: 0 E0B (deterministic grader only, needs a run), 95 E1 (carries a judge model)
- E1 cases that ALSO carry an E0B-verifiable component (tool_used/regex, checkable from the transcript without the judge): 95
- tool-running (Bash granted): 12; scaffold (planted defects): 1
- say-no cases: 18
- state: 95 NOT_RUN, 0 with a recorded result
- documented provider-gated NOT_RUN (85-88, 89-95): 11

Every case needs a model to run its agent; no behavioural PASS is asserted by this inventory.
