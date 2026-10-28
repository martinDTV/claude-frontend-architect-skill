---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Client-side polling table with optimistic cancel in a Next.js dashboard that already uses Axios"
expected_outcome: "TanStack Query with refetchInterval and rollback over a service layer; one QueryClient per browser session and per request"
tags: ["activation:architect", "domain:react-next", "domain:state"]
---
In our Next.js dashboard, a client-side table polls job statuses every 5 seconds and supports optimistic cancel. How do I structure fetching? We already use Axios elsewhere.
