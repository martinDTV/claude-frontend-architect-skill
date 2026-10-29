---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Says the three edges are false positives: a component name inside a JSDoc block, a line comment, a string literal or an HTML comment is documentation or text, not a dependency; nothing is resolved or rendered from it
- Explains why the tools differ: a regex over the raw file (or over the template text) matches `<Name` wherever it appears, including comments; an engine that walks the SFC template AST and the script syntax tree only sees real elements and real identifiers, so comments never produce tags
- Recommends confirming by reading the file (the real template renders a `<ul>` and a slot) and then recording no edge; the in-house detector should strip comments before scanning tags, or be used only as a lead
- Keeps the report honest: the absence of an edge is reported as "no dependency found", not as proof the component is unused elsewhere

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Keeps the three edges "to be safe"
- Recommends deleting the documentation comments so the detector stops matching
- Claims an AST-based engine cannot miss anything or that a regex detector is useless; the point is the mechanism, not a verdict on either tool
