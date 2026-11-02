---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A React team asks whether to wrap every component in memo and every value in useMemo/useCallback to be safe"
expected_outcome: "No blanket memoization; memoize only with a measured render problem (Profiler); note React Compiler removes the need; keep components pure"
tags: ["activation:architect", "domain:performance", "domain:react"]
---
Someone on our React team wants to wrap every component in React.memo and every value and handler in useMemo/useCallback, just to be safe about performance. Should we do that across the codebase?
