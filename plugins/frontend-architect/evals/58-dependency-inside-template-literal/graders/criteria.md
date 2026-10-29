---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Says both are real runtime dependencies: `contar` and `plural` are called at runtime; where the call sits (inside a template literal expression, inside a bound attribute) does not change that
- Explains the mechanism of the disagreement: an AST-based engine parses `${...}` expressions and bound-attribute expressions as code, so it sees the calls; a detector that blanks string and template-literal contents before matching identifiers discards the expression together with the string, so it misses them; this is a known limit of that approach, not a random bug
- Verifies instead of accusing: recommends reading the two lines (and checking that `contar` and `plural` are not local declarations or properties) before concluding, and states that the AST engine's edges should be trusted for this file once that reading confirms the calls
- Points out the consequence for boundary enforcement: a detector with this blind spot would also miss a forbidden cross-domain dependency written inside a template literal, so the gap matters beyond this file

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Says the dependency is not real because it is "inside a string"
- Declares the in-house detector broken, or the plugin wrong, without explaining the mechanism and without recommending verification in the code
- Recommends rewriting the component to avoid template literals so the detector passes
