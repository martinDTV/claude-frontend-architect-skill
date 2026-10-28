# Nuxt Layers

Layers let a Nuxt application extend other Nuxt applications: a layer is a directory with the Nuxt structure (its own `nuxt.config.ts`, components, composables, pages, server routes) that the consuming app merges in. They share **within one build and one deploy**. They are the right tool for a base shared by several Nuxt apps and the wrong tool for splitting one app into folders (`modular-monolith.md`) or for independent deployment (`microfrontends.md`).

Written against Nuxt 4 documentation; the exact resolution rules changed between Nuxt 3 and 4, so confirm details for the installed minor.

## Contents
- What a layer shares
- Local layers and `extends`
- Priority and merging
- Use cases
- What layers do not give
- Caveats reported by users (verify in your version)
- Minimal example
- Layers vs packages vs microfrontends
- Checklist before adopting

## What a layer shares

Everything the Nuxt directory structure recognizes: `components/`, `composables/`, `utils/`, `pages/`, `layouts/`, `middleware/`, `plugins/`, `server/` (routes, middleware, utils), `public/`, `app.config.ts`, `nuxt.config.ts` (modules, runtime config defaults, route rules, CSS), `i18n` resources when the module supports layers, and TypeScript types. In Nuxt 4 a layer follows the same layout as an app (an `app/` source directory next to `server/` and `nuxt.config.ts`); check the layers guide for the installed version if a layer written for Nuxt 3 is reused.

A layer's `nuxt.config.ts` is merged with the app's: modules declared in the layer are installed, its `runtimeConfig` becomes defaults, its `routeRules` and `css` are added. This is how a layer carries a design system (Nuxt UI configuration, theme CSS, tokens) or a shell (layouts, auth middleware, session plugin).

## Local layers and `extends`

| Source | How | When |
|---|---|---|
| `~~/layers/*` | Directories inside the project's `layers/` folder are registered automatically (Nuxt 3.12+ and Nuxt 4) | Organizing a single repo into a shell layer and feature layers that always deploy together |
| `extends: ['../base']` | Relative path, typically in a monorepo | Several apps in one workspace sharing a base |
| `extends: ['github:org/repo#main']` | Git remote (fetched at install/build; supports subdirectories and auth tokens) | Shared base across repositories without publishing |
| `extends: ['@company/nuxt-base']` | npm package | The recommended way to distribute a layer with versioning and a changelog |

Publishing as an npm package gives semver, a lockfile entry per consuming app, and a review step when the base changes; git remotes make every build depend on a branch state.

## Priority and merging

- The application's own files override files from layers with the same path (a component with the same name in the app wins; a page with the same route in the app wins).
- Among several layers, the order is defined by the registration mechanism; the Nuxt 4 documentation specifies the precedence between auto-registered `layers/` directories and `extends` entries. Do not rely on memory here: write a tiny conflict (two layers defining the same component) and observe which one wins in the installed version, then document it in the repo.
- Config objects are deep-merged (`defu` semantics): arrays such as `modules` and `css` are concatenated, scalars are overridden by the higher-priority source.
- `app.config.ts` merges the same way at runtime, which is what makes per-tenant theme overrides in a thin app on top of a product layer possible.

## Use cases

| Use case | Shape | Notes |
|---|---|---|
| Design system and shell shared by several Nuxt apps (product app + admin panel) | `packages/nuxt-base` layer: Nuxt UI module and theme, tokens CSS, layouts, session plugin, API plugin, error contract, auth middleware | Exactly the "base package" that `modular-monolith.md` says to extract when a second deployable appears |
| White-label / per-tenant builds | Product layer + one thin app per tenant overriding `app.config.ts`, branding assets and a few pages | One build per tenant; runtime tenant resolution (`auth-session-tenant.md`) is usually cheaper than one build per tenant |
| Monorepo with several Nuxt apps | Apps `extends` a base layer by relative path; features that only one app needs stay in that app | Combine with pnpm workspaces; the layer is a workspace package |
| Domain layers inside one app | `layers/orders`, `layers/billing` with their own pages and server routes | Works, but gives no boundary enforcement by itself: a layer can import anything from another layer. Modules with `index.ts` plus dependency rules are simpler for this purpose |
| Documentation or marketing site sharing components with the app | Marketing app extends the design-system layer only, not the product layer | Keeps the marketing bundle free of app code |

## What layers do not give

- **Independent deployment.** The consuming app builds everything; a change in the layer ships when the app rebuilds.
- **Runtime isolation.** One Vue, one Pinia, one router, one `<UApp>`; a plugin in a layer runs for every page of the app.
- **Boundary enforcement.** Imports across layers are not restricted.
- **Versioned contracts** unless the layer is an npm package with a release process.

If independent deploy is the requirement, the documented alternatives are route-based composition (several Nuxt apps behind a proxy) or, with the caveats in `microfrontends.md`, runtime federation.

## Caveats reported by users (verify in your version)

These were open or recently closed issues in the Nuxt tracker when this reference was written. Treat them as things to test in a spike, not as facts about your version:
- `~/` and `@/` aliases inside a layer resolving against the consuming project rather than the layer; prefer relative imports or layer-specific aliases inside layer code.
- `nuxt typecheck` reporting errors for aliases or auto-imports used inside layers when the layer is consumed via `extends`.
- Plugin and global-middleware ordering across layers: when order matters (a session plugin before an API plugin), use `dependsOn` in plugins and explicit numeric prefixes, and test the order.
- HMR and type generation when extending a layer outside the project root.
- Module-specific limits: Nuxt UI supports one theme configuration per application, so two layers cannot each carry a full theme for the same page; i18n modules need layer-aware configuration.

A one-hour spike that creates the layer, consumes it from two apps, runs `nuxt typecheck` and `nuxt build` in both and exercises plugin order answers all of these for the installed versions.

## Minimal example

Structure of a base layer published from a monorepo:

```
packages/nuxt-base/
├── nuxt.config.ts          # modules: ['@nuxt/ui'], css: ['./app/assets/css/tokens.css'], runtimeConfig defaults
├── app.config.ts           # ui: { colors: { primary: 'brand' } }
├── app/
│   ├── layouts/default.vue
│   ├── middleware/auth.ts
│   ├── plugins/api.ts      # per-request HTTP client (axios.md / nuxt.md)
│   ├── composables/useSession.ts
│   └── components/shell/AppHeader.vue
└── server/utils/errors.ts
```

Consuming app (`apps/admin/nuxt.config.ts`):

```ts
export default defineNuxtConfig({
  extends: ['../../packages/nuxt-base'],
  runtimeConfig: { public: { apiBase: '/api/v1' } },
  compatibilityDate: '2026-10-01',
})
```

With an npm-published layer the `extends` entry becomes the package name and the app's `package.json` pins its version. (Not compiled by this repository's harness: layer resolution needs a Nuxt build; verify in a spike.)

## Layers vs packages vs microfrontends

| Concern | Nuxt layer | Workspace package (`packages/ui`, `packages/api-contracts`) | Route-based microfrontends |
|---|---|---|---|
| Shares pages, layouts, middleware, plugins, server routes | Yes | No (only importable code) | No (each app owns its routes) |
| Shares plain TypeScript, tokens, generated clients | Yes, but heavier than needed | Yes, framework-agnostic, also for Next.js | Through packages |
| Independent deploy | No | No | Yes |
| Runtime isolation | No | No | Yes (full page navigation between apps) |
| Works with a Next.js app in the same product | No | Yes | Yes |
| Versioning | npm package optional | npm package natural | Contracts package + proxy config |
| Enforces boundaries | No | Partially (package imports are explicit) | Yes (different builds) |
| Complexity | Low–medium | Low | Medium–high |

Default: tokens, contracts and framework-agnostic code as packages; Nuxt-specific shell and design system as a layer when two or more Nuxt apps exist; route-based composition only when independent deploy is required.

## Checklist before adopting

- [ ] At least two Nuxt applications (or a credible second one within months) will consume the layer.
- [ ] The shared surface is listed: which components, composables, plugins, middleware, config.
- [ ] Ownership and release process decided (npm package with semver preferred).
- [ ] Spike done in the installed versions: typecheck, build, plugin order, alias resolution, theme.
- [ ] Boundary rules remain in the consuming apps (layers do not provide them).
- [ ] Decision recorded in an ADR with the alternatives (workspace package, copy, route-based composition).
