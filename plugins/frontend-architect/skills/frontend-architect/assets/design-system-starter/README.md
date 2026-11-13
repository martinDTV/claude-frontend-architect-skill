# design-system-starter — a Nuxt 4 layer that is one reference for people and agents

Nine components on Nuxt UI, every colour, radius and duration a contract role, a barrel as the public surface, a
data view that cannot forget a state, and an `AGENTS.md` section generated from the code. It is a **starter**, not
a library: copy it, replace the contract with yours, delete what you do not need, and keep the properties.

## Use it

```bash
# as a layer (keeps upgrades cheap):
cp -R <plugin>/skills/frontend-architect/assets/design-system-starter layers/design-system
# nuxt.config.ts: extends: ['./layers/design-system']
# or copy app/ into your app and own it outright.
```

1. **Replace the contract.** `design-contract.json` is the enterprise example from the skill. Edit it (or write
   yours with `references/design-contract.md`), validate and regenerate the tokens — never edit the CSS by hand:
   ```bash
   node <plugin>/scripts/design-contract.mjs design-contract.json
   node <plugin>/scripts/design-contract.mjs design-contract.json --emit tailwind --nuxt-ui-neutral contract-neutral > app/assets/css/tokens.css
   node <plugin>/scripts/design-contract.mjs design-contract.json --emit nuxt-ui > app/assets/css/nuxt-ui-map.css
   ```
2. **Keep the barrel honest.** `app/components/ui/index.ts` is what is public. A component not exported there is
   private to the folder.
3. **Regenerate `AGENTS.md` after every change** to the folder, and let the agent read it:
   ```bash
   node <plugin>/scripts/design-system-inventory.mjs . --agents > AGENTS.md
   node <plugin>/scripts/design-system-inventory.mjs . --md       # the review view; exit 1 on a confirmed finding
   ```
4. **Eject when a wrapper is not enough**, with the marker on the first line and the hash refreshed when you edit:
   `<!-- @ds-ejected from="<registry>/<name>" version="<v>" sha256="<sha256 of the file without this line>" -->`.

## What is in it

| Component | Rule it carries |
|---|---|
| `DsButton` | while `loading` it is busy, disabled and ignores clicks; tone and size are the only choices |
| `DsIconButton` | the accessible name is a required prop |
| `DsField` | visible mandatory label; hint and error linked through `aria-describedby`; error announced |
| `DsSelect` | a labelled native select; value or `null` as the model |
| `DsDialog` | mandatory title; a dirty dialog asks before closing; focus returns to the opener |
| `DsDataRegion` | the `DataView` union: loading, empty, error, partial and success, all rendered, region labelled and busy |
| `DsEmptyState` | what an empty region says and the action that fills it |
| `DsStatusBadge` | tone by name and text, never colour alone; variants in one `tv()` |
| `DsKpi` | numeric font, change direction in text |

Doctrine and the reasons: `references/agent-ready-design-system.md`. Verified in the skill's own gate: the layer is
extended by the Nuxt reference app, type-checked, rendered on `/design-system` and passed through `browser-audit`
(axe, keyboard, responsive) with 0 confirmed findings; the inventory of this folder is pinned with 0 findings and
its generated files (`tokens.css`, `nuxt-ui-map.css`, `AGENTS.md`) are checked to be byte-identical to a fresh run.
