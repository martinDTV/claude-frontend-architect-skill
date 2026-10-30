---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Says the table's horizontal scroll is intentional and not a defect: a container with `overflow-x: auto` (or marked `data-allow-overflow`) is a scroller, and the `horizontal-overflow` check never names an intentional scroller as a culprit; the defect would be page-level overflow caused by an element outside such a scroller, which is what the culprit list is for
- Says the covered Save button is a real defect: `control-covered` (a fixed bar over a control), reported per viewport and per text scale, with `control-cut-off` as the sibling case for a control pushed outside the viewport; at 125% text the bar grows and covers what still fit at 100%
- Gives the matrix: `mobile`, `tablet` and `desktop` viewports with text scale `1` and `1.25` (`browser-audit.mjs --checks responsive --viewports mobile,tablet,desktop --text-scale 1,1.25`), noting that it runs against a local or staging URL and only with explicit opt-in
- Layout decisions: reserve space for the bar (bottom padding or `scroll-padding-bottom` equal to its height) so content is never under it; sizes in `rem` or tokens so the bar scales with the text; the bar always present or with a measured height so nothing jumps when it appears; the primary action lives in the bar or sticky at the form header and stays reachable at every size
- Table decisions: keep the density (consistent row heights, tabular numerals), a sticky first column and a visible scroll affordance (edge shadow or scrollbar); a column-visibility control may be offered as a convenience, not as the fix
- Keyboard and screen-reader notes: the scroller is reachable by keyboard (focusable container or focusable cells) and the covered control is also a focus problem (focus scrolls the control under the bar), which is why `scroll-padding` matters

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Proposes removing the table scroll, or hiding columns / collapsing to cards on mobile, as the only fix
- Treats the intentional scroller as a defect to be removed
- Dismisses the 125% text size as an unsupported edge case, or fixes the covered button only at desktop or only at 100%
- Proposes decorative animation, parallax or Three.js for a back-office table
