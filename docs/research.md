# Research: existing skills and ecosystem status

Research date: 2026-10-16. Re-run before each major release; this ecosystem moves monthly.

## Method

**Verified** columns come from shallow-cloning each repository (`git clone --depth 1`) and reading the files directly: license file or per-skill `license:` frontmatter, date of the last commit, number of `SKILL.md` files, total and maximum `SKILL.md` length, number of executable scripts, number of scripts containing network calls or URLs (a heuristic that also counts URLs in comments, so it flags *for review*, not maliciousness), and whether the repo ships a Claude Code `marketplace.json`. Package versions, peer dependencies and deprecation flags come from the npm registry API.

**Conclusions** are the authors' judgement after sampling content, and are labelled as such. Content was sampled, not exhaustively reviewed: a full line-by-line review of ~110,000 lines of third-party skills was out of scope.

No third-party text or code is redistributed in this repository. Complementary skills are referenced and recommended for separate installation.

## Skills: verified facts

| Repository | License (verified) | Last commit | SKILL.md files | Lines (total / largest) | Scripts / with network refs | Claude marketplace |
|---|---|---|---|---|---|---|
| onmax/nuxt-skills | MIT (per-skill frontmatter, README) | 2026-10-12 | 26 | 3,496 / 534 | 7 / 1 | yes |
| vinayakkulkarni/vue-nuxt-best-practices | MIT | 2026-07-25 | 5 | 544 / 157 | 16 / 0 | no |
| KIMJINWOO4/vue-skills | MIT | 2026-10-15 | 17 | 957 / 204 | 4 / 1 | yes |
| vuejs-ai/skills | MIT | 2026-03-26 | 8 | 540 / 202 | 0 / 0 | yes |
| vercel-labs/agent-skills | MIT (per-skill frontmatter, README) | 2026-08-28 | 9 | 1,740 / 353 | 166 / 38 | no |
| anthropics/skills | Mixed: per-skill `LICENSE.txt`; `frontend-design` is Apache 2.0; some skills are proprietary | 2026-10-09 | 20 | 4,006 / 616 | 77 / 33 | yes |
| pbakaus/impeccable | Apache 2.0 | 2026-10-16 | 25 | 1,846 / 90 | 364 / 28 | yes |
| nextlevelbuilder/ui-ux-pro-max-skill | MIT | 2026-10-15 | 13 | 2,642 / 336 | 144 / 29 | yes |
| Leonxlnx/taste-skill | MIT | 2026-10-14 | 14 | 7,156 / 1,465 | 11 / 3 | yes |
| JaimeJunr/claude-code-frontend-skills | MIT | 2026-10-13 | 37 | 11,389 / 1,465 | 48 / 11 | yes |
| freshtechbro/claudedesignskills | MIT | 2025-11-19 | 90 | 71,350 / 1,233 | 236 / 67 | yes |
| zyliu0/3d-frontend | MIT (README) | 2026-03-03 | 0 (single `3D-frontend.md`) | n/a | 0 / 0 | no |
| acumenix/claude-code-frontend-design-toolkit | MIT (README) | 2026-04-11 | 0 (curated list, not a skill) | n/a | 0 / 0 | no |
| emilkowalski/skills | MIT | 2026-10-11 | 15 | 3,359 / 674 | 0 / 0 | no (installed via `npx skills`) |
| greensock/gsap-skills (official GSAP) | MIT | 2026-04-21 | 8 | 1,854 / 433 | 6 / 0 | yes |

Verified skill names in key repositories:
- **onmax/nuxt-skills**: nuxt, nuxt-ui, nuxt-modules, nuxt-content, nuxt-seo, nuxt-i18n, nitro, pinia, vue, vue-best-practices, vueuse-functions, reka-ui, vitest, vite, and others.
- **vuejs-ai/skills**: vue-best-practices, vue-pinia-best-practices, vue-router-best-practices, vue-testing-best-practices, vue-debug-guides, create-adaptable-composable, vue-jsx and options-api variants.
- **vercel-labs/agent-skills**: react-best-practices, composition-patterns, web-design-guidelines, react-view-transitions, react-native-skills, deploy and Vercel CLI skills.
- **emilkowalski/skills**: emil-design-eng, review-animations, find-animation-opportunities, improve-animations, animation-vocabulary, apple-design, pick-ui-library, and others.
- **greensock/gsap-skills**: gsap-core, gsap-timeline, gsap-scrolltrigger, gsap-plugins, gsap-react, gsap-frameworks, gsap-performance, gsap-utils.

## Skills: conclusions and recommendation

| Repository | Strengths (conclusion) | Limitations / risks (conclusion) | Overlap with this skill | Recommendation |
|---|---|---|---|---|
| greensock/gsap-skills | Official, maintained by the library authors, granular | GSAP API only; no architecture or "when not to animate" policy | GSAP API detail | **Recommend as optional companion.** `creative-frontend` keeps decisions, performance policy and framework lifecycle; defers API detail to these when installed |
| emilkowalski/skills | Strong taste on motion and UI polish; no scripts | Opinionated; React-leaning examples; the main SKILL.md is long | Motion polish | **Recommend as optional companion** for animation review |
| vuejs-ai/skills | Small, focused, Vue-team adjacent; no scripts | Last commit March 2026; no Nuxt architecture | Vue Composition API rules | **Reference + optional companion** |
| onmax/nuxt-skills | Broad Nuxt ecosystem coverage, actively maintained, marketplace | Many skills; overlaps among them; one script with network refs to review | Nuxt conventions, Nuxt UI, Pinia | **Recommend as optional companion** for module-level API detail (Nuxt UI, Nuxt Content, i18n) |
| KIMJINWOO4/vue-skills | Synced from upstream, CI-checked | Mostly aggregates others | Vue/Nuxt | Reference only |
| vinayakkulkarni/vue-nuxt-best-practices | Compact | Smaller scope; not a marketplace | Vue/Nuxt | Reference only |
| vercel-labs/agent-skills | Authoritative React/Next performance and composition rules | Many scripts (deployment tooling) to review before install; Vercel-centric parts | React patterns, web design guidelines | **Recommend `react-best-practices` and `composition-patterns` as companions**; review scripts first |
| anthropics/skills (`frontend-design`) | Strong anti-"generic AI look" design direction | Mixed licensing across the repo; check per skill | Visual design direction | **Recommend as companion** for visual direction |
| pbakaus/impeccable | Design audit workflow; small SKILL.md files | 364 scripts: review before installing | UI audit | Optional companion for design audits |
| nextlevelbuilder/ui-ux-pro-max-skill | Large design knowledge base | Many scripts; broad overlap | UI/UX | Reference only |
| Leonxlnx/taste-skill | Variety of visual styles | Very long SKILL.md files (up to 1,465 lines) load a lot of context | Visual style | Reference only |
| JaimeJunr/claude-code-frontend-skills | Wide coverage | 11k lines; large overlap with everything | Everything | Reference only |
| freshtechbro/claudedesignskills | Huge creative catalog (90 skills) | Last commit 2025-11; 71k lines; 236 scripts; heavy context cost | Creative dev | Reference only; not recommended for installation without review |
| zyliu0/3d-frontend | Clear scope | Single-file HTML output, not framework-integrated | 3D landing pages | Reference only |
| acumenix/…-design-toolkit | Useful index of tools | Not a skill | n/a | Reference only |

Gap this skill fills (conclusion): none of the reviewed repositories combines **requirement-driven architecture decisions** (when to add state libraries, HTTP layers, monorepos or microfrontends, and when not to) across **both Nuxt and Next.js**, with verified examples and evals. Most skills teach an API; few teach when not to use it.

## Ecosystem status (npm registry, 2026-10-16)

| Package | Latest | Notes (verified) |
|---|---|---|
| nuxt | 4.6.2 | |
| vue | 3.5.44 | |
| next | 16.4.2 | `middleware.ts` deprecated in favor of `proxy.ts`; Cache Components with `"use cache"` (Next 16) |
| react | 19.3.1 | |
| pinia | 4.1.0 | v4 breaking changes: ESM only, `@vue/devtools-api` must be installed alongside |
| @pinia/nuxt | 1.0.3 | peer `pinia ^4.1.0` |
| @pinia/colada | 1.4.8 | peer `pinia ^2.2.6 || ^3 || ^4.0.2` |
| @pinia/colada-nuxt | 1.2.0 | |
| @pinia/testing | 2.0.2 | peer `pinia >=4.1.0` |
| pinia-plugin-persistedstate | 4.7.1 | last publish 2025-11-01; peer `pinia >=3.0.0` |
| pinia-orm | 2.0.0 | Node >= 22.12 |
| @nuxt/ui | 4.12.0 | |
| axios | 1.20.0 | |
| ofetch | 1.5.1 | |
| @tanstack/vue-query / react-query | 5.104.3 | |
| zustand | 5.0.15 | |
| @reduxjs/toolkit | 2.13.0 | |
| jotai | 3.0.1 | |
| recoil | 0.7.7 | **last publish 2024-02-12**: treat as unmaintained |
| zod | 4.6.7 | |
| valibot | 1.5.0 | |
| gsap | 3.15.0 | license field: "Standard 'no charge' license" (gsap.com/standard-license), not an OSI license |
| three | 0.186.1 | |
| @tresjs/core, @tresjs/nuxt | 5.9.3, 5.7.3 | |
| @react-three/fiber | 9.8.2 | peer `react >=19 <19.4` |
| lenis | 1.3.27 | `@studio-freight/lenis` is **deprecated**, renamed to `lenis` |
| motion | 14.3.0 | `framer-motion` publishes the same version |
| @vueuse/core | 15.0.0 | |
| @module-federation/nextjs-mf | 8.8.76 | peer `next ^12–^15`: **no Next 16**; App Router not supported; maintainers announced end of life |
| @module-federation/vite | 1.23.5 | |
| single-spa | 6.0.3 | |
| radix-vue | 1.9.17 | last publish 2025-02; renamed to **reka-ui** (2.11.0) |
| madge | 8.0.0 | last publish 2024-08 |
| vitest | 5.0.5 | |
| @playwright/test | 1.64.1 | |
| knip / oxlint / dependency-cruiser | 6.41.0 / 1.88.0 / 18.6.0 | |
