# Component libraries

## Contents
- Selection rules
- Nuxt UI
- shadcn/ui
- Other libraries
- Wrapping and extending

## Selection rules

1. **Use what the project already uses** unless it is unmaintained or blocks a requirement (accessibility, SSR, theming). Migration is an ADR, not a side effect of a feature.
2. For new projects, pick by framework and need:

| Need | Nuxt / Vue | Next.js / React |
|---|---|---|
| Full-featured, themeable, Tailwind-based | **Nuxt UI** | **shadcn/ui** |
| Headless primitives for a custom design system | Reka UI (successor of Radix Vue) | Radix UI, Base UI, React Aria |
| Enterprise data-heavy apps (complex tables, many form controls) | PrimeVue, Vuetify | MUI, Mantine |
| Minimal Tailwind headless | Headless UI (Vue) | Headless UI (React) |

3. Check before adopting: maintenance (recent releases), accessibility track record, SSR support, bundle impact, theming model, license.
4. **Never recreate a component the library provides.** Compose or extend it. A custom `<Modal>` next to the library's dialog is two focus-trap implementations to maintain.

`radix-vue` (last published 2025-02, verified) was renamed **reka-ui**; use `reka-ui` in new code.

## Nuxt UI

Verified current major: 4.x (`@nuxt/ui` 4.12). Built on Reka UI and Tailwind CSS. Read the docs for the installed version at ui.nuxt.com; when the Nuxt UI MCP server or the `onmax/nuxt-skills` `nuxt-ui` skill is available, use them for exact component APIs instead of memory.

- Install as a Nuxt module; wrap the app in `<UApp>` (required for toasts, tooltips and overlays).
- Theme through `app.config.ts` (`ui` key: colors and per-component slot/variant overrides) and CSS variables; do not override internal classes with deep selectors.
- Use its form system (`UForm` with Zod/Valibot schemas) and overlay composables (`useToast`, `useOverlay`) instead of custom ones.
- Use its layout and dashboard components when building dashboards rather than assembling from scratch.
- Dark mode via the color-mode integration; test both modes.

## shadcn/ui

Not a dependency: the CLI copies component source into your repo (`components/ui`), which you own and edit.

- Add components with the CLI (`npx shadcn@latest add <component>`); keep `components.json` committed.
- Theme with CSS variables (one source of tokens) and variants with `class-variance-authority`; keep the `cn()` helper.
- Because the code is yours, upgrades are manual: diff against the registry when updating. Avoid editing primitives heavily; wrap them in feature components.
- Forms: shadcn's form components with React Hook Form + Zod, or `useActionState` for Server Functions.
- Accessibility comes from the underlying primitives (Radix or Base UI); do not remove ARIA wiring when restyling.

## Other libraries

- **PrimeVue**: very broad component set (data tables, charts); styled or unstyled mode.
- **Vuetify**: Material Design; strong for internal tools; heavier.
- **MUI / Mantine / Chakra**: mature React suites; check their styling engine compatibility with Server Components (CSS-in-JS runtimes often require Client Components).

## Wrapping and extending

- Wrap library components in a feature component only to add domain meaning (`<OrderStatusBadge>` wrapping `<UBadge>`), not to rename props.
- Keep one icon set and one date library.
- Document deviations from the library in the design system docs.
