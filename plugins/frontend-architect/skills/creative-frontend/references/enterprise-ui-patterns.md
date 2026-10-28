# Enterprise UI patterns

Visual and interaction criteria for the screens that make up ERPs, back offices, clinical systems and SaaS consoles: dashboards, long forms, dense tables, deep navigation, and the states around them. Engineering of tables and forms (contracts, state, validation) is in the `frontend-architect` skill (`data-tables.md`, `forms.md`, `charts.md`); accessibility rules in `accessibility.md`; the visual foundations in `visual-design.md` and `layout-and-responsive.md`.

## Contents
- Dashboards
- Complex forms
- High-volume tables
- Navigation for many modules
- States
- Notifications
- Information density
- Admin versus field contexts
- Accessibility hooks per pattern
- Anti-patterns

## Dashboards

A dashboard answers "what needs my attention and what do I do next". If the user must scroll or click to answer that, the layout failed.

- **Above the fold**: the two or three numbers that drive action today, each with context: period, comparison (previous period or target), trend direction, and the unit. A number without context is decoration.
- **KPI tiles**: value in tabular figures at the largest size on the screen; label quieter; delta with sign and color plus an arrow or text (never color alone); a sparkline only when the trend matters; click leads to the breakdown.
- **Chart density**: one message per chart; at most four to six charts per screen; shared time axis and units across charts that will be compared; direct labels over legends (`charts.md`).
- **Filters and time range** live in the URL so a view can be shared and bookmarked; global filters at the top, local ones next to their chart; a visible "reset".
- **Refresh cadence** matches the data: operational boards poll or stream with a visible "updated at"; management boards refresh on load. Never auto-refresh a screen the user is editing.
- **Empty and first-run state**: a new tenant with no data sees what the dashboard will show and the first action that produces data (import, connect, create), not a grid of zeros.
- **Layout**: KPIs in one row, then charts in a 2 or 3 column grid aligned to the page grid; tables of exceptions (overdue, failed, pending approval) below the charts, because the exceptions are the work.
- Role-aware boards: the same screen can show different top numbers per role, derived from permissions, not from separate pages per role.

## Complex forms

- **Sectioning**: group fields into sections of three to eight related fields with a heading and, when useful, a one-line purpose; a single column per section (two columns only for short, related fields such as postal code and city).
- **Progressive disclosure**: advanced or conditional fields appear when relevant (`v-if`, not disabled rows); defaults pre-filled from context (current project, tenant, last used values) and visibly editable.
- **Validation timing**: validate a field on blur, re-validate on change after a first error, validate everything on submit and move focus to the first error with a summary at the top (`forms.md`, `accessibility.md`). Never validate on every keystroke before the user finishes typing.
- **Sticky actions**: the primary action is visible at the bottom of the viewport on long forms; the cancel/secondary action next to it, visually quieter; the destructive action elsewhere.
- **Long forms vs wizards**: a wizard when steps are sequentially dependent or the whole form intimidates; a single long form with a sticky section index when the user needs to review and jump. Both show progress and allow leaving with a saved draft.
- **Review step** before irreversible submissions (orders, prescriptions, payroll): a read-only summary with "edit" links per section.
- **Destructive confirmations** name the object and the consequence ("Delete contract C-2041 and its 14 estimates? This cannot be undone.") and require a distinct action; type-to-confirm for catastrophic operations only.
- **Field patterns**: units attached to numeric inputs; date pickers that also accept typing; selects with search above ~10 options; currency fields with fixed decimals and thousands separators on blur; read-only computed fields visibly different from inputs.
- **Error recovery**: server errors map to fields; a failed submit never clears the form; drafts survive session expiry (`auth-session-tenant.md`).

## High-volume tables

- **Column priority**: decide which columns matter at a glance (identifier, status, the one number, owner, date) and which are secondary; secondary columns hide first on narrow viewports or live in a detail panel.
- **Density toggle** (`layout-and-responsive.md`) and persisted column visibility/order for power users; saved views (filters + columns + sort) when the same users return daily.
- **Sticky header** always; **sticky first column** for wide tables; horizontal scroll with a visible shadow or indicator.
- **Row actions**: the primary action on the row itself (click opens detail); at most two or three inline actions, the rest in a menu; never icon-only without an accessible name and tooltip.
- **Bulk actions**: selection by checkbox with a header checkbox; a contextual bar appears with the count and the actions; "select all N matching" distinct from "select the 25 on this page".
- **Pagination vs infinite scroll**: pagination for operational data the user navigates and references ("page 3"); infinite scroll only for feeds. Page size options and the total count where cheap (`data-tables.md`).
- **Filters** as chips above the table with a clear-all; the current filter state in the URL; counts next to filter options when the backend can supply them.
- **Numbers** right-aligned in tabular figures with consistent decimals; **dates** in one format with relative time only as a secondary hint; **status** as text with a color token, not color alone.
- **Row states**: hover, selected, focused, expanded, disabled; inline edit highlights the editable cell and shows save/cancel.
- One table component with column configs; forty hand-made tables in one app guarantee inconsistency.

## Navigation for many modules

- **Information architecture** for 10+ modules: group by business capability as the user names them, not by backend service; two levels maximum in the menu (module → screen); deeper structure lives inside the screen (tabs, sub-navigation).
- **Permission-aware menu** derived from one configuration (module, screens, required permission, icon, route); the same source feeds breadcrumbs, document titles and the command palette, so the menu cannot drift from the routes.
- **Breadcrumbs** for hierarchies deeper than two (project → contract → estimate); the current page is the heading, not a link.
- **Command palette** (⌘K) for power users: screens, entities by name or id, recent items; keyboard reachable; never the only way to reach something.
- **Context switchers** (tenant, organization, project): visible at all times in the shell, with the current context named in full; switching clears or re-scopes data and confirms when unsaved work exists.
- **Deep links** for every screen and detail; back button behaves; tabs and filters in the URL.
- **Current location** always marked in the menu and reflected in the document title.

## States

Every data region designs five states before it ships (`design-systems.md` lists them; this is how they look):

| State | Looks like |
|---|---|
| Loading | A skeleton with the shape and size of the final content (rows, tiles, chart area); spinners only for small, short waits; no layout shift when data arrives |
| Empty | One sentence of why it is empty and the next action as a button; illustration optional and consistent; never a lonely "No data" |
| Error | What happened in human terms, a retry when it can help, and a support reference (request id) for the help desk; never raw codes or stack traces |
| Partial | The data that loaded, plus a quiet notice of what failed or is stale and how to refresh |
| Success / confirmation | Inline feedback near the action; an undo for reversible operations (archive, move) instead of a confirmation dialog before them |

Skeletons reuse the component's layout; a generic gray block that is replaced by a very different shape is worse than a spinner.

## Notifications

| Mechanism | Use for | Rules |
|---|---|---|
| Inline message | Result of the user's own action in context (form saved, field error) | Next to the action; persistent until resolved |
| Toast | Background confirmations and non-blocking outcomes | Short, dismissible, not the only place the information exists; pausable on hover/focus; stacked limit |
| Banner | System-wide conditions (maintenance, suspended account, degraded data) | Top of the shell; dismissible only if not actionable |
| Inbox / bell | Events the user may act on later (approvals, mentions, failures) | Unread count, grouping, mark as read, deep link to the item |
| Blocking dialog | Decisions that must be made now | Rare; names the consequence; never for information |

Urgency maps to the mechanism, not to color intensity. An error toast that disappears in four seconds has not informed anyone.

## Information density

- Data-ink: remove gridlines, borders, backgrounds and icons that carry no information; keep what helps reading (zebra striping for wide rows, a baseline grid in charts).
- Density without coldness: generous line height inside dense tables, a clear focal point, warm neutral grays instead of pure black on white, and whitespace between regions rather than inside cells.
- Show more by hierarchy, not by shrinking: secondary values smaller and quieter under the primary value in the same cell.
- Progressive detail: summary row → expandable detail → full record page.
- Numbers are easier to compare in columns than in cards; cards are for heterogeneous items.

## Admin versus field contexts

| Aspect | Admin / analyst (desktop, hours) | Field / point-of-care (mobile, seconds) |
|---|---|---|
| Density | Compact available | Comfortable, large targets |
| Primary input | Keyboard, shortcuts, bulk actions | One hand, few taps, barcode/camera |
| Information | Comparisons, histories, exports | The current task and the next step |
| Conditions | Controlled | Sunlight, gloves, poor connectivity: higher contrast, offline tolerance, visible sync state |
| Errors | Detailed, with references | Short, with a clear recovery action |

One design system serves both through density modes and a per-context layout, not through two products.

## Accessibility hooks per pattern

- Dashboards: every chart has a text alternative or table toggle; KPI tiles are headings with the value as text; live-updating regions announce politely or not at all.
- Forms: labels, descriptions and errors programmatically associated; sections as `fieldset`/`legend`; focus management on step changes and on submit errors.
- Tables: real `<table>` semantics (or the ARIA grid pattern with full keyboard support), header scope, `aria-sort`, row selection announced, actions reachable by keyboard.
- Navigation: landmarks, skip link, current page `aria-current`, menu and palette operable by keyboard, focus returned on close.
- States: loading via `aria-busy`, errors in `role="alert"` when they interrupt, toasts in a polite live region.

## Anti-patterns

- Cards inside cards inside cards: nesting boxes to group instead of proximity and headings.
- Icon-only actions in tables and toolbars without labels or tooltips.
- Modals for everything: viewing a record, editing a long form, confirming trivial actions. Use pages, side panels and inline editing; modals for short, focused decisions.
- Status conveyed only by colored dots.
- Dashboards that are a grid of every metric available.
- Infinite scroll on operational tables.
- Auto-refresh that discards in-progress edits.
- Confirmation dialogs without the consequence ("Are you sure?").
- Toast as the only error channel.
- Disabled buttons with no explanation of what is missing.
- Fixed-width columns that truncate ids, names and amounts.
