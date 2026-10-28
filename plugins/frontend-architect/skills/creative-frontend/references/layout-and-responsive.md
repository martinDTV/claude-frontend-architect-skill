# Layout and responsive design

How to structure space so that one design works from a 320 px phone to a 1920 px monitor, in several languages, zoomed to 200%, and on paper. Visual direction is in `visual-design.md`; enterprise-specific patterns in `enterprise-ui-patterns.md`; accessibility criteria in `accessibility.md`; performance (images, CLS) in `performance.md`.

## Contents
- Grids and containers
- Breakpoints by content
- Density modes
- Mobile and tablet patterns
- Responsive typography
- Images, aspect ratios and layout shift
- Print
- Visual internationalization
- Zoom and reflow
- Testing viewports
- Common layout defects

## Grids and containers

- **Page grid**: 12 fluid columns with a fixed gutter (16 to 24 px) and a maximum content width per role: reading 65 to 75 ch; forms 480 to 720 px; dashboards and tables use the full width.
- **Content-out sizing**: size containers from their content (the longest label, the widest number) and let the grid adapt, instead of forcing content into equal columns.
- **Container queries** (`@container`) for components that live in several contexts (a card in a sidebar and in a main column); **media queries** for page-level layout (navigation, columns). Check browser support for the audience before relying on container queries for critical layout.
- **Sidebar collapse**: a permanent sidebar needs roughly 1024 px or more with a 240 to 280 px rail; below that it becomes a drawer or a rail with icons and labels on hover/focus. Collapsing is a layout state in the URL or a persisted preference, not a hover effect.
- **Sticky regions**: page headers, table headers and action bars may stick; never more than two sticky bands on a small viewport, or content disappears.
- **Intrinsic layouts**: `grid-template-columns: repeat(auto-fit, minmax(…))`, `flex-wrap` and `min()`/`max()`/`clamp()` reduce breakpoint count. Write the layout for the content, then add breakpoints only where it breaks.

## Breakpoints by content

Breakpoints are where the layout breaks, not device names. Typical outcome for an application:

| Width | Layout change |
|---|---|
| < 480 px | Single column; tables become cards or scroll; navigation in a drawer or bottom bar |
| 480 to 768 px | Two-column forms where fields are short; still single-column data |
| 768 to 1024 px | Sidebar as a drawer or icon rail; two content columns possible |
| ≥ 1024 px | Permanent sidebar; multi-column dashboards |
| ≥ 1440 px | Cap line length; add a third column or a details panel instead of stretching |

Resist adding a breakpoint for every device. Each breakpoint multiplies testing.

## Density modes

Enterprise users work in the interface for hours; density is a preference, not a style:

- Define two scales, **comfortable** (row height 44 to 48 px, 16 px body) and **compact** (row height 32 to 36 px, 13 to 14 px body), switched together through tokens.
- Compact does not shrink touch targets below 24 px CSS (WCAG 2.5.8) and keeps the 44 px size for primary mobile actions.
- Density applies to tables, lists and forms; headings and page chrome stay stable.
- Persist the choice per user; default comfortable for new users, compact for power-user roles if the product knows them.

## Mobile and tablet patterns

- **Navigation**: up to five top-level destinations → bottom bar; more → drawer with sections; tablets in landscape can keep a rail. Current location always visible.
- **Tables**: for under six columns, stack into cards with label/value pairs; for wide operational tables, horizontal scroll with a sticky first column and a visible scroll affordance; always provide a search/filter so users do not scroll to find a row.
- **Forms**: one column; the keyboard type matches the field (`inputmode`, `type`); actions sticky at the bottom; long forms split into steps (`enterprise-ui-patterns.md`).
- **Touch targets**: 44 × 44 px for primary actions, 24 px minimum anywhere, 8 px between adjacent targets.
- **Gestures** never the only way: swipe-to-delete needs a visible button alternative.
- **Hover** does not exist: anything revealed on hover needs a tap or focus equivalent.
- **Tablets** are not large phones: use the width (two panes: list and detail), and support keyboards and pointers.
- **Safe areas** (`env(safe-area-inset-*)`) for fixed bars on notched devices.
- Field conditions (sunlight, gloves): higher contrast, larger targets, fewer precise interactions.

## Responsive typography

- Fluid sizes with limits: `font-size: clamp(1rem, 0.9rem + 0.5vw, 1.25rem)`; never unbounded `vw` units (they break zoom and produce absurd sizes).
- Body text never below 16 px on touch devices (also prevents iOS input zoom).
- Headline scale steps grow with the viewport; body text barely changes.
- Line length is controlled by the container, not by the font size.

## Images, aspect ratios and layout shift

- Every image and embed has reserved space: `width`/`height` attributes or `aspect-ratio`; `object-fit: cover` for art-directed crops.
- `<picture>` or the framework image component for art direction (a different crop on mobile), responsive `sizes`, modern formats (`performance.md`).
- Reserve space for late content (ads, banners, charts, embeds) with a skeleton of the final size; CLS comes from unreserved space.
- Icons as inline SVG or a sprite sized in `em`/`rem` so they scale with text.

## Print

ERP, medical and financial products print: invoices, orders, reports, prescriptions.

- A `@media print` stylesheet: hide navigation, toolbars and sticky bars; expand collapsed sections; black text on white; show link URLs only where useful.
- Tables: repeat `<thead>` on each page (`thead { display: table-header-group }`), avoid row breaks (`break-inside: avoid`), fit the page width.
- Page setup: `@page { size: A4; margin: 16mm }` (or Letter by locale); headers with document title, date and page numbers where the browser allows.
- Documents that must be identical every time (legal, medical) are generated server-side as PDF; the print stylesheet is for convenience.
- Test print preview in two browsers; "print to PDF" is the most common path.

## Visual internationalization

Engineering of i18n lives in `i18n.md`; the layout must survive it:

- **Text expansion**: German and Spanish run 20 to 35% longer than English; Finnish and Russian more; short labels expand up to 300%. Buttons, tabs, table headers and navigation items must grow or wrap; no fixed widths around text.
- **Truncation policy**: truncate only where the full text is reachable (tooltip, detail view) and never for actions or numbers. Prefer wrapping to two lines over ellipsis in tables.
- **RTL**: use logical properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`), mirror directional icons (arrows, back), do not mirror symbols (clocks, play, checkmarks) or charts' time axis conventions without review; set `dir` on `<html>` from the locale.
- **Numbers, dates, currencies** are wider in some locales (`1 234 567,89 €`); columns sized by the longest formatted value, aligned to the right (or `end`) with tabular figures.
- **Names and addresses** do not fit fixed field orders or lengths; one line for a full name, flexible address blocks.
- **No text in images**; illustrations and icons must not depend on reading direction or script.
- **Fonts** must cover the scripts you ship (Latin extended, Cyrillic, CJK if needed); fallbacks declared per script.

## Zoom and reflow

- At 200% zoom (WCAG 1.4.4) all text remains readable and functional; at 400% (equivalent to a 320 px wide viewport, WCAG 1.4.10) content reflows into one column without horizontal scrolling, except for data tables, maps and diagrams that legitimately need two dimensions.
- Use `rem` for sizes and spacing that should scale with the user's text setting; `px` only for borders and hairlines.
- Fixed and sticky elements shrink or hide at high zoom so they do not cover content.

## Testing viewports

Minimum matrix for every release: 320 × 568, 375 × 812, 768 × 1024 (portrait and landscape), 1024 × 768, 1440 × 900, 1920 × 1080; plus 1280 × 720 at 200% zoom and a 320 px-equivalent reflow check. Add the real device classes of the audience (point-of-sale terminals, rugged tablets). Automate screenshots at these sizes (`testing-scenarios.md`) and review them by eye at least once per layout change.

## Common layout defects

| Defect | Cause | Fix |
|---|---|---|
| Horizontal scroll on mobile | Fixed widths, unbroken strings, 100vw with scrollbar | `max-width: 100%`, `overflow-wrap: anywhere` for ids/urls, avoid `100vw` |
| Text clipped in buttons/tabs after translation | Fixed widths/heights | Size from content; allow wrapping or two lines |
| Jumping content on load | Images/fonts/embeds without reserved space | Dimensions, `aspect-ratio`, metric-compatible fallback fonts |
| Sticky header hides focused field | Scroll into view ignores sticky height | `scroll-padding-top` on the scroll container |
| Misaligned columns across cards | Each card lays out its own grid | `subgrid` or shared column definitions |
| Table unreadable on phone | Twelve columns forced into 360 px | Card layout or horizontal scroll with sticky first column |
| Elements overlap at 200% zoom | Absolute positioning and fixed heights | Flow layout, min-heights, intrinsic sizing |
| Unreadable in RTL | Physical properties, non-mirrored icons | Logical properties, mirrored directional icons |
