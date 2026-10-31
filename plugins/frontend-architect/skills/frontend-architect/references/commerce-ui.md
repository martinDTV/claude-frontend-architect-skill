# Commerce UI

A shop's interface is the catalogue, the product and the bag. The method here is the frontend of a small specialist store: filters as the main navigation, cards that compare across rows, a detail page whose variants are never ambiguous, stock that is real and small, a bag that works without a server, and an honest end where payment would be. Nothing here charges anyone; payments, tax and fulfilment are a backend's work and out of scope. The reference implementation is Ember & Ash, `/shop` in the Nuxt verification app, built from the `ember-store` contract with Nuxt UI and checked by `verification/browser/shop-checks.mjs`; its domain module (`verification/shared-ui/shop/`: a deterministic catalogue, pure filter, search and sort functions with a URL round trip, the bag reducer and its versioned storage) is framework-free and unit-tested.

## Contents
- The domain first
- The catalogue
- Cards and the shelf
- Availability
- The product page
- The bag
- Performance: the grid never shifts
- Accessibility specifics
- Themes
- What the browser check proves
- Lessons from the reference
- Checklist

## The domain first

Write the catalogue types, the filter state and the bag reducer as pure functions before any component: `applyCatalogState(all, state)`, `catalogStateToQuery`/`queryToCatalogState`, `cartReducer(cart, action)`, `cartTotals`, `readCart`/`writeCart` with a version. They are tested in Node in minutes, both frameworks can host them, and the browser check can assert exact outcomes. Prices are integers in cents; availability is a function of a variant's stock and made-to-order flag; a piece's availability is its best variant's.

## The catalogue

- **Filters are the navigation** (maker, form, glaze, availability): checkboxes inside `<fieldset>`s with `<legend>`s, a rail on the left from 1024 px, a sheet behind a "Filters" button below it, the same component in both. Each change writes the URL; chips show the active filters and remove them; "Clear all" resets.
- **Search** is the header form (`role="search"`) and lands in the same URL (`?q=`).
- **Sort** is a select: featured, price ascending and descending, name. Sorting by price uses the lowest variant price.
- **The count line** tells the truth and is `aria-live="polite"`: "48 pieces", "3 pieces for “celadon”".
- **Paging** through the URL (`?page=2`), 24 per page; "nothing on this shelf" is a distinct state from an empty catalogue and offers to clear.

## Cards and the shelf

A strict grid (2, 3, 4 columns by width with the contract's gutter) so glazes can be compared across rows. Each card: the photograph in a fixed 4:5 box, the name, the maker in the serif, the price or price range in tabular figures, the availability in words. The whole image and name are one link; the card gains a stronger border on hover and focus-within, nothing lifts. Explicit `grid-cols-1`/`grid-cols-2` on every breakpoint: an implicit single grid column is auto-sized by its content and pushes the page wider than a phone.

## Availability

Four states, always as a word and a small shape, colour secondary: `● In stock`, `◐ Last few` (with the number on the detail: "Only 2 left in this glaze and size"), `○ Sold out` (full contrast, never greyed out), `◇ Made to order` (with the lead time). The action follows the state: sold out disables "Add to bag" and says why; made to order allows up to a per-line cap.

## The product page

- **Gallery** on the left two thirds: the chosen variant large, the other glazes as thumbnails that are buttons (`aria-pressed` on the current one). Changing the variant cross-fades the photograph (320 ms; reduced motion cuts it).
- **Purchase panel** on the right, sticky on a desktop: maker, name, price, availability word, the stock note, the variant picker, quantity and the action. Under 768 px it becomes a **sticky bottom bar** with the price, the availability and the action (44 px); the page keeps bottom padding so the bar never covers focused controls.
- **Variants are never ambiguous**: glaze as radio swatches with visible labels, size as radio buttons, only combinations that exist, the chosen one with a 2 px accent ring. The choice lives in the URL (`?glaze=&size=`) so a shared link opens the same variant and back returns to the previous one.
- Breadcrumb, description, care and the maker's note below the gallery; nothing autoplays.

## The bag

- **Client-owned state**: a `useState` in Nuxt (a context or store in React) around the pure reducer; a versioned `localStorage` record (`ember.cart.v1`), read after hydration (the server renders an empty bag), written on every change, re-read on the `storage` event so tabs agree. Malformed, old-version or unknown-piece records are dropped on read; quantities are re-capped against the stock.
- **Add confirms without leaving the page**: the count badge bumps once (the contract's feedback motion), a status region announces it, a toast offers "Open bag".
- **The drawer** is a dialog (focus trapped, Escape closes, focus returns to the bag button): lines with the thumbnail, the variant, a quantity stepper (buttons named "One more …"/"One fewer …", capped by stock or the per-line cap, with the reason shown at the cap), remove, subtotal, delivery (free above a threshold), total, the made-to-order lead time, "Review bag".
- **The summary page** repeats the lines as a table and the totals, and ends honestly: "Continue to delivery" disabled with a sentence that says checkout is outside this reference and no address or payment is collected anywhere.

## Performance: the grid never shifts

Photographs in fixed 4:5 boxes with a placeholder of the piece's dominant colour, so cards keep their size before the image arrives; the reference draws the piece procedurally (SVG from the form silhouette and the glaze colour) so the catalogue needs no image request at all. Two sizes per image in a real shop, the thumbnail and the hero, both with width and height. No carousel scripts, no infinite scroll by default (paging is a link).

## Accessibility specifics

Filters as native checkboxes with legends; the sheet is a dialog; variant swatches are radio inputs with visible labels; the bag drawer traps and restores focus; the stepper buttons are named; availability is never colour alone; the sticky bar leaves room for focus; everything reaches at 320 px; the dark theme leaves the photographs on their studio surface so colours stay true.

## Themes

Two themes from the contract's roles. Photographs are not inverted or tinted: the art box keeps its light surface in the dark theme (the check reads the computed background of the box and the SVG's surface fill in dark mode).

## What the browser check proves

`shop-checks.mjs` (run by `verification/nuxt/check-shop.mjs` on the production build): the catalogue's first page of 24 cards with availability words in the server HTML, inside the scoped contract; the count line; a maker filter narrowing the shelf with its chip; sort by price ascending verified on the cards; the availability filter leaving only sold-out pieces; search by glaze; page two; Tab reaching the rail and a card; on the detail, glaze radios and an availability word, the glaze change updating the URL, the photograph and the pressed thumbnail; adding twice counting to two with the status announced; the drawer's line and stepper updating the total and the count; Escape returning focus to the bag button; the bag surviving a reload as a versioned record; the summary page's line and total in euros; remove emptying everywhere; a sold-out variant disabling the action with the word; at 375 px the filter sheet, the two-column shelf and the sticky bar with a 44 px action; no overflow at 320 px; the dark theme keeping the studio surface; reduced motion leaving nothing running after an add; legibility graded on the catalogue in both themes and on the detail; `browser-audit` on three routes with zero confirmed findings.

## Lessons from the reference

- A random comparator in `Array.prototype.sort` to "shuffle" the glazes made the server's catalogue differ from the browser's (the engines call the comparator differently), so hydration mismatched on every card. A Fisher–Yates shuffle driven by the seeded generator fixed it; the browser check's console rule caught it.
- A disabled quantity field at the contract's disabled opacity was first reported by the legibility grade as a control caught mid-fade; disabled controls are now recorded as a state and exempt from the ratio (SC 1.4.3 inactive components).
- The single-column grid under the breakpoint overflowed a phone because an implicit column is sized by its content; `grid-cols-1` fixed the catalogue, the detail and the bag page alike.

## Checklist

- [ ] Domain as pure functions with tests: catalogue state and URL round trip, bag reducer, versioned storage
- [ ] Filters in fieldsets, rail and sheet from one component, chips, clear, count line live, URL for everything
- [ ] Strict card grid, fixed 4:5 boxes with placeholders, four lines per card, prices tabular
- [ ] Availability as word and shape; sold out at full contrast; the action follows the state
- [ ] Variants unambiguous (radios with labels, only existing combinations, in the URL); gallery thumbnails as pressed buttons
- [ ] Sticky purchase panel; 44 px bottom bar on phones that never covers focus
- [ ] Bag: reducer, versioned storage read after hydration, cross-tab, dialog with focus restore, named steppers capped by stock, honest end without payment
- [ ] Dark theme leaves photographs alone; reduced motion cuts feedback motion
- [ ] The browser check passes on the production build
