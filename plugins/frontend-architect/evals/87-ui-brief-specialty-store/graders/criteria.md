---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Writes a design contract first with requirements that include real stock, unambiguous variants, filters as navigation, a bag reachable from anywhere, photographs untouched in dark mode; decisions per area citing them; serif for maker names and a sans with tabular figures for prices; and names the validator.
- Starts from the domain as pure functions with tests: catalogue types, availability as a function of stock and made-to-order, filter/search/sort/paging with a URL round trip, a bag reducer with stock caps and a versioned storage record read after hydration and re-capped against stock, totals in integer cents.
- Describes the catalogue with filters in fieldsets (a rail from about 1024px, a sheet behind a button below), chips for active filters, a truthful live count line, sort by lowest variant price, paging through the URL, and a strict card grid with fixed 4:5 image boxes and placeholders so the grid never shifts; four short lines per card with availability as a word and a shape.
- Describes the product page with variants as radio swatches with visible labels (only existing combinations), the variant in the URL, the photograph, price and stock changing together, a sticky purchase panel that becomes a 44px bottom bar on phones with room kept so it never covers focused controls, and the action following the state (sold out disables and says why; made to order allows a capped quantity).
- Describes the bag as a dialog drawer with focus trapped and restored, named quantity steppers capped by stock, remove, totals with a delivery rule, cross-tab sync, a summary page, and an honest end that says no payment is taken here.
- Covers the dark theme leaving the photographs on their light surface, reduced motion cutting the bag bump and the variant crossfade, 320px and 200% text with a concrete pitfall, keyboard operation of filters, swatches and the drawer.
- Gives a verification plan separating proved (server-rendered cards, URL state, variant change, bag persistence across reload, sold-out disabled, audit with zero confirmed findings), flagged, and judged (the warmth, the photographs), with evidence named.
- States proportionality: no account system, no recommendation engine, no infinite scroll by default, no 3D, no payments.

The response FAILS if it does any of the following:
- Puts the catalogue or the bag in a global store copied from server data without reason, or keeps the bag only in memory, or stores it without a version.
- Encodes availability by colour alone, greys out sold-out cards, or lets variants be ambiguous (a dropdown without the combination's stock and price).
- Skips the phone layout, the dark-theme rule for photographs, or the honest end of the purchase.
- Claims visual quality without the check and evidence, or claims an external skill ran without the Skill tool result.
