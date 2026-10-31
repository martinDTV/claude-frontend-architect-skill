# Enterprise UI patterns

An enterprise application is many modules, dense data and long sessions: dispatchers, clerks and analysts who use the same screens for hours. What makes it professional is not a visual style but behaviours that hold under load: every data region has its states, every list keeps its state in the URL, every destructive action names its consequence, every form recovers, the keyboard reaches everything, and the whole app reads at a glance in both themes. This reference lists those behaviours, how each maps to Nuxt UI and to shadcn/ui, and what a browser check can prove about them. The two reference applications in `verification/` (`nuxt/harness/app/pages/app/*` with `layouts/app.vue`, `next/harness/src/features/atlas/*` with `app/app/layout.tsx`) implement all of them from the same design contract (`references/design-contract.md`) and the same domain module (`verification/shared-ui/saas/*`).

## Contents
- The shell
- Data regions and their five states
- The URL is the table state
- Row actions, destructive actions, undo
- Forms that recover
- Preferences
- Search palette
- Density, theme, legibility
- Keyboard and focus
- Responsive: the table becomes cards
- Nuxt UI and shadcn/ui: the same behaviours, different parts
- Hooks for checks: the `data-*` contract
- What the browser check proves
- Checklist

## The shell

One shell for the whole application: a sidebar that collapses to icons on a desktop and becomes a drawer on a phone, the product mark linking to the home of the app, a search entry, the primary navigation with the current page marked (`aria-current="page"`), and the account or environment facts in the footer. The shell owns the viewport; a host page's navigation does not wrap it (the verification harness hides its own nav under `/app` for this reason, in both frameworks).

Rules that do not depend on the library:

- A **skip link** to `#main` is the first focusable element; every page renders `<main id="main" tabindex="-1">` so the skip target and the route-change focus have somewhere to land.
- The sidebar's toggle has a name ("Toggle sidebar", "Collapse sidebar") and a keyboard shortcut that is discoverable, not required.
- Navigation items are links, not buttons: middle-click, copy link and back all work.
- The shell renders on the server. If the layout mechanism is silently skipped (a Nuxt `app.vue` without `<NuxtLayout>`, a Next route group without its `layout.tsx`), pages still work and nothing errors; a check that asserts the sidebar's links in the server HTML catches it.

## Data regions and their five states

Every region that depends on data renders one of five states, and the state is visible to a check: `data-region="<name>" data-state="loading|empty|error|ready"` on the region's root (the fifth state, *partial*, is `ready` with a notice). The region owns its request lifecycle: cancel the request a page no longer wants, keep the previous rows while refetching, and never show a spinner for data that is already there.

| State | What the user sees | What the markup says |
|---|---|---|
| Loading | A skeleton shaped like the result (rows, tiles), not a spinner; after ~1 s a line of text | `role="status"` with an accessible name ("Loading shipments") |
| Empty | What the region would show, why it is empty, and the next action as a link or button | A heading, a sentence, one primary action |
| Error | What failed in plain words, the request id for support, a retry that re-requests | `role="alert"`; the retry is a button |
| Ready | The data | Nothing special |
| Partial | The data plus a notice ("3 lanes could not be loaded") | The notice is `role="status"` |

Make every state reachable without code changes. The reference apps take an api mode from the URL (`?api=empty|fail|slow`) through the same simulated client; a real app does it with a mock server mode, a feature flag or a query parameter that is ignored in production.

## The URL is the table state

Sort, filters, search, page and page size live in the query string, nowhere else (`references/data-tables.md`). Consequences the user feels: the back button returns to the previous view, a shared link opens the same rows, a reload keeps the filters, a preference (default page size) applies only when the URL says nothing. Rules:

- Only what differs from the defaults goes into the URL (`?status=late` rather than seven parameters).
- Changing a filter resets the page to 1; changing the page size resets it too.
- The result line reads the truth: "Showing 26–50 of 400 · 2 filters", with `aria-live="polite"`.
- Sortable headers are buttons with `aria-sort` on the active one; the sort cycle is ascending → descending → (optionally) none.
- A debounced search box writes to the URL after ~250 ms; the URL is the source of truth, the input is a local echo of it.
- The "no match" case (filters are on, nothing passes) is not the empty state: it offers "Clear filters" and keeps the toolbar.

The pure functions in `verification/shared-ui/saas/table-state.ts` (`applyTableState`, `stateToQuery`, `queryToState`, `toggleSort`) are the whole of that logic; both apps call them and a unit test pins the round trip.

## Row actions, destructive actions, undo

Row actions live in one menu per row (a button named "Actions for ATL-26311", not an unlabeled ellipsis), with the primary "view" first, state changes in the middle and the destructive action last and visually distinct. Phone cards show the two most used actions inline.

- **Reading** opens a side panel (slideover, sheet) that names the record in its title; closing returns focus to the row's actions button. Libraries return focus to the element that opened the overlay; when that element was a menu item that no longer exists, restore it explicitly to the row button (the Next app does this with `onCloseAutoFocus`).
- **Reversible changes** ("Mark delivered") apply at once and offer **Undo** in the toast for a few seconds. Undo is a real button with that name.
- **Irreversible changes** ("Cancel shipment") ask first. The confirmation names the record and the consequence ("ATL-26311 for Norte Fresh will be removed from the plan and the customer and driver will be notified. This cannot be undone."); the confirming button repeats the verb ("Cancel shipment"), the other button is not "Cancel" (use "Keep it").
- **Changes that need input** ("Assign driver") open a dialog with one form: validation on submit ("Choose a driver who is on duty."), a pending state on the submit button, a server refusal mapped to the field, focus trapped and restored.

Toasts confirm; they never carry the only copy of an error. An error that needs action stays in the page (`role="alert"`).

## Forms that recover

`references/forms.md` has the method; the enterprise specifics:

- One schema (Zod) shared by every surface that creates the record: the page form, the dialog, the import. Messages say what happened and what to do ("Use the format ATL-26001 (ATL, a dash and five digits).").
- Labels always visible, helper text before the error, the error after the control and linked with `aria-describedby`; `aria-invalid` on the control.
- Validate on blur and on submit, not on every keystroke before the first blur.
- On a failed submit, render an **error summary** at the top ("Check 5 fields before saving." with links to the fields) and move focus to it in the same render that shows it (a layout effect or `nextTick`, not a timer).
- A server conflict (409, duplicate reference) lands on its field *and* in the summary; the submit button returns to its idle label.
- Success leaves the form: redirect to the list filtered by the new record with a notice ("ATL-26999 is planned. It is at the top of the list, filtered by its reference.").
- Dates: a native `type="date"` input is keyboard-operable and localised by the platform; a calendar popover is an addition, never the only way to type a date.

## Preferences

Density, theme, visible columns and default page size are user preferences: a versioned record in `localStorage` (`atlas.preferences.v1`, `references/persistence.md`), validated with the same schema library on read, nothing sensitive in it. Applied at once (density as `data-density` on `<html>`, theme as the `dark` class), saved on change, confirmed inline ("Saved · 10:42:08" with `aria-live="polite"`) and in a toast. Read on the client only; the server render never depends on a browser value.

## Search palette

Cmd/Ctrl+K opens a palette with pages and records; the same entry exists as a visible button in the sidebar for people who do not know the shortcut. Selecting a record navigates to its list filtered by its identifier, so the palette is a shortcut into the normal flow, not a parallel one. Nuxt UI: `UDashboardSearch` with `defineShortcuts`; shadcn: `CommandDialog` (cmdk) with a `keydown` listener.

## Density, theme, legibility

Dense by default for operators (32 px rows), comfortable on request (40 px). Both themes come from the same contract roles; status is encoded by word, glyph and colour at once (`▲ Late`, `◐ At risk`) so no state depends on colour alone. Every text passes the legibility grade in both themes (`references/design-systems.md`, the 4B rule); the lowest ratios in the reference apps are the muted captions and the status badges, both above 4.5:1.

## Keyboard and focus

- Tab reaches the toolbar controls in order (search, status, lane, assignment, clear) before the table; nothing in the shell traps focus.
- Headers sort on Enter and Space (they are buttons). Menus, dialogs, sheets and selects follow the WAI-ARIA patterns through the library; do not rebuild them.
- Route changes move focus to `#main`; opening an overlay traps focus; closing it restores focus to the opener.
- Every shortcut (⌘K, ⌘B) has a visible equivalent.

## Responsive: the table becomes cards

Under 768 px a wide table is unreadable and a horizontal scroller hides the status column. Render the same rows as stacked cards with the identifier and the status first, two or three facts and the two primary actions; keep the toolbar, the result line and the pagination. At 320 px nothing overflows (SC 1.4.10). The dashboard keeps its first KPI above the fold on a phone.

## Nuxt UI and shadcn/ui: the same behaviours, different parts

| Behaviour | Nuxt UI 4 | shadcn/ui (radix-ui) |
|---|---|---|
| Shell | `UDashboardGroup`, `UDashboardSidebar` (collapsible, resizable, drawer on mobile), `UDashboardPanel`, `UDashboardNavbar`, `UDashboardToolbar` | `SidebarProvider`, `Sidebar collapsible="icon"`, `SidebarInset`, `SidebarTrigger` (Sheet on mobile) |
| Navigation | `UNavigationMenu` vertical with `to` | `SidebarMenuButton asChild` around `Link` |
| Search palette | `UDashboardSearch` + `UDashboardSearchButton`, `defineShortcuts` | `CommandDialog`, `CommandInput`, `CommandItem` |
| Table | `UTable` with TanStack column defs; header renderers return a button with `aria-sort` | `Table` primitives; header buttons with `aria-sort` |
| Filters | `USelectMenu multiple` (listbox), `USelect` | `DropdownMenuCheckboxItem` (menu), `Select` |
| Pagination | `UPagination` | `Pagination` primitives with links that also update the client state |
| Row actions | `UDropdownMenu` items with `onSelect` | `DropdownMenu`, `DropdownMenuItem variant="destructive"` |
| Side panel | `USlideover` | `Sheet` with `onCloseAutoFocus` |
| Dialogs | `UModal` with `#footer="{ close }"` | `Dialog`, `DialogFooter` |
| Toasts | `useToast().add({ actions: [{ label: 'Undo' }] })` | `sonner` `toast(..., { action: { label: 'Undo' } })` |
| Forms | `UForm :schema` + `UFormField`, `setErrors` for server errors | `Field`, `FieldLabel`, `FieldError` + the schema's `safeParse` |
| Preferences controls | `URadioGroup`, `UCheckboxGroup`, `USelect` | `RadioGroup`, `Checkbox`, `Select` with `Label` |
| Theme | `useColorMode()` (`classSuffix: ''`) | the `dark` class set by the preference and a boot script |
| Focus ring | The contract's solid ring overrides the 25%-alpha default (1.45:1 measured) | The contract's solid ring overrides the 50% ring |

Neither library ships the behaviours: the five states, the URL state, the confirmation copy, the error summary and the focus restore are the application's.

## Hooks for checks: the `data-*` contract

A browser check should drive behaviour, not class names. Both apps expose the same hooks, which is what lets one script verify two libraries:

`data-region`/`data-state` (regions), `data-loading`/`data-empty`/`data-error` (state blocks), `data-kpi`/`data-kpi-value`, `data-chart`, `data-exceptions`, `data-toolbar`, `data-search`, `data-filter-status`, `data-filter-lane`, `data-filter-assigned`, `data-clear-filters`, `data-result-count`, `data-no-match`, `data-shipments-table`, `data-shipments-cards`, `data-sort="<key>"`, `data-status="<status>"`, `data-row-actions="<reference>"`, `data-shipment-details`, `data-assign-driver`, `data-assign-submit`, `data-confirm-cancel`, `data-page-size`, `data-pagination`, `data-created`, `data-shipment-form`, `data-error-summary`, `data-submit`, `#field-<name>`, `data-pref="<key>"`, `data-saved`, `data-vehicles`, `data-fleet-filter`.

Options in menus and listboxes are found by role (`option`, `menuitemcheckbox`, `menuitem`) and name, never by position in the library's DOM.

## What the browser check proves

`verification/browser/saas-checks.mjs` (run by `verification/nuxt/check-saas.mjs` and `verification/next/check-saas.mjs` against the production builds) asserts, in order: the server HTML has the main landmark, the loading region, a language and a title; five KPI tiles with numbers and links, two charts each with an accessible alternative, up to eight exception rows, no console problems; the empty state's next action, the error's message and request id announced as an alert, retry re-requesting, the slow api's skeleton; 25 rows and "Showing 1–25 of 400", sort by customer in both directions with `aria-sort` and the URL updated, the status filter leaving only late rows, the search narrowing to one reference, clearing restoring the page, page two reading "26–50", page size 50 returning to page one; details naming the shipment and focus returning to the row button, the assign dialog's validation and success toast, delivered then undone, the cancel confirmation naming the shipment and the consequence, the row gone; the empty submit's summary focused with the invalid fields counted, the redirect with the new reference listed first, the server conflict on the reference field; density, theme and columns persisted across a reload and the table following the column preference; Tab reaching at least four toolbar controls, re-entry restoring the URL state and the same rows, 25 cards and no table at 375 px, no overflow at 320 px, the first KPI above the fold on a phone, no running animation under reduced motion; then `browser-audit` on four routes with zero confirmed findings. It does not prove the copy is right, the information architecture fits the users, or the charts answer the questions dispatchers ask: those are human judgement (`references/ui-verification.md`).

## Checklist

- [ ] Shell on the server, skip link first, `<main id="main" tabindex="-1">` on every page, the current page marked
- [ ] Every data region: loading (skeleton + status), empty (next action), error (message + request id + retry), ready; all reachable
- [ ] Table state in the URL; result line truthful and live; `aria-sort`; filters reset the page; "no match" distinct from "empty"
- [ ] Row actions named per row; read in a panel; reversible with undo; irreversible with a confirmation that names record and consequence; focus restored
- [ ] One schema per record; summary focused on failure; server errors on their fields; success leaves the form with a notice
- [ ] Preferences versioned, validated, applied at once, confirmed
- [ ] Palette plus a visible search entry; shortcuts optional
- [ ] Dense default, comfortable option; status by word, glyph and colour; legibility graded in both themes
- [ ] Tab reaches everything; overlays trap and restore focus; route changes move focus
- [ ] Cards under 768 px; nothing overflows at 320 px
- [ ] One browser check drives both implementations through the `data-*` contract
