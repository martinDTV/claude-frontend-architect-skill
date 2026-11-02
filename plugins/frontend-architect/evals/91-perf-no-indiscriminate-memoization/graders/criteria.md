---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Advises against blanket/indiscriminate memoization across the codebase
- Says to memoize only where the React DevTools Profiler shows an expensive component re-rendering with equal props, or a value feeding a memoized child / effect dependency
- Notes that React Compiler, when enabled, memoizes automatically and hand-memoization becomes unnecessary (and keeping components pure matters more)

The response FAILS if it does any of the following:
- Endorses wrapping everything "to be safe"
- Treats the absence of memo/useMemo as a defect by itself
- Promises a performance gain from memoization without any measurement
