# An agent-ready design system (Vue/Nuxt)

A design system is agent-ready when a person and a coding agent build from the **same reference**: one inventory
of what exists and how it is used, tokens as the only source of colour, space, radius and shadow, open internals
that can be ejected when a wrapper is not enough, and rules short enough to live in `AGENTS.md`. This reference
is the Vue/Nuxt form of the model `meta/astryx` made explicit for React (a CLI that answers `component --list` and
`docs`, themes as CSS-variable overrides, `swizzle` to own a component's source). Nothing here is a component
library: Nuxt UI, Reka UI, shadcn-vue and PrimeVue exist; this is how to make the one you chose legible and auditable.

## The four properties, and how each is checked

| Property | What it means in a Vue/Nuxt repo | How it is checked |
|---|---|---|
| **One reference** | `components/ui` (or `components/design-system`) with an `index.ts` barrel that is the public surface; nothing imports a component file directly | `design-system-inventory.mjs` reads the roots, marks `public` from the barrel, `--agents` prints the section for `AGENTS.md`; `contracts-check.mjs` catches imports that bypass a barrel |
| **Tokens, not literals** | the design contract emits CSS custom properties (`design-contract.mjs --emit css|tailwind|nuxt-ui`); components reference `var(--…)`; brands and tenants are override files, switched without a rebuild | `design-consistency.mjs` reports literals as defects where a token layer exists; the inventory counts a component's literals and lists declared-but-unused tokens |
| **Open internals** | wrappers add a project rule (a mandatory prop, a default, a behaviour) or do not exist; when the library's API blocks a requirement, **eject** the component's source into the root and own it | the inventory reports `pass-through-wrapper` (a wrapper with nothing of its own) and `owner: ejected-copy` with drift |
| **Rules an agent can follow** | five lines in `AGENTS.md`: import from the barrel; tokens not literals; a data view renders loading/empty/error/partial/success; eject with the marker and refresh it; document every public component with one sentence and an `@example` | `--agents` generates them; `undocumented-public-component` and `data-view-missing-states` flag the gaps |

## Eject or wrap — the decision

- **Use the library component directly** when its API fits. A wrapper "for consistency" is a pass-through layer: it
  hides the real API from the agent and from the next developer and adds nothing (the inventory names it).
- **Wrap** when the project has a rule the library does not enforce: a dialog whose title is mandatory, a button
  whose `loading` disables clicks, a select that always renders its label. The wrapper declares props/emits/models
  of its own — that is what distinguishes it from a pass-through.
- **Eject** when you need the internals: a different DOM structure, a behaviour the library's slots cannot reach, a
  variant system the `ui` prop cannot express. Copy the source into the root (shadcn-vue does this by design; for
  Nuxt UI, copy the component from `node_modules/@nuxt/ui` or re-implement on Reka UI) and put the marker on the
  first line:
  ```html
  <!-- @ds-ejected from="shadcn-vue/badge" version="0.11.0" sha256="<sha256 of the file without this line>" -->
  ```
  The hash is the drift signal: when you edit an ejected component on purpose, refresh it; a stale hash tells the
  next reviewer the copy diverged from its origin without anyone saying so. Ejected copies are project code: the
  project's tests, tokens and accessibility rules apply to them in full.
- **Never** restyle a library primitive from product code with deep selectors, and never fork the library itself.

## Variants, states, documentation

- **Variants** live in one place per component: `tailwind-variants` / `cva` for project components, the `ui` prop and
  `app.config.ts` for Nuxt UI. The inventory reads the first two; a variant computed at runtime is reported as
  unresolved, which is a reason to make it declarative.
- **Data views** (anything that renders fetched data) model the view as a discriminated union — `{ status: 'loading' }
  | { status: 'empty' } | { status: 'error', message, retry } | { status: 'partial', rows, failed } | { status:
  'success', rows }` — so every state has to be rendered. The inventory's `data-view-missing-states` is heuristic:
  a state rendered by the parent is not a defect; say so when you verify.
- **Documentation is presence first**: a leading `<!-- -->` comment with one sentence and an `@example` is what the
  `--agents` table shows. Storybook/Histoire are the project's choice for living docs; the inventory recognises a
  sibling story as documentation but does not require one.

## Exposing the system to agents

1. `node scripts/design-system-inventory.mjs . --agents >> AGENTS.md` (or `CLAUDE.md`) after every change to the
   root; the section is generated, never hand-edited, and a CI check can diff it against a fresh run.
2. Keep the design contract JSON in the repo as the token source of truth; emit tokens from it, do not hand-write
   them.
3. When the project uses Nuxt UI, its MCP server gives agents the library's own docs; the inventory gives them
   **your** layer on top. The two do not overlap.
4. In review, run the inventory with `--json` and diff `summary` and `findings` against the previous run: a new
   pass-through wrapper, a new undocumented public component or a drifted copy is a review comment, not a surprise.

## A starting point

`assets/design-system-starter/` is a Nuxt 4 layer that has the four properties: nine components on Nuxt UI
(button with a loading rule, icon button with a mandatory name, field with linked hint/error, native select,
dialog with mandatory title / dirty guard / focus return, the five-state data region, empty state, status badge
with `tv()` variants, KPI), tokens emitted from a design contract, a barrel, no-prefix registration, and an
`AGENTS.md` generated by the inventory. Its README says how to copy it and replace the contract. The skill's own
gate extends it from the Nuxt reference app, type-checks it, renders it on `/design-system` and passes
`browser-audit` over it; its inventory is pinned clean and its generated files are checked against a fresh run.

## Honesty bounds

The inventory is static and lexical: it never renders, it does not know what a runtime-computed variant produces,
it cannot see the library's internals, and `documented` is presence, not quality. Visual correctness is `browser-
audit` and human review (E2); accessibility of the markup is `ui-audit`; literals are `design-consistency`.
