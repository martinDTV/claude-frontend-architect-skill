---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Next.js App Router: a Server Component reaching a client-only module through a helper, a Client Component reaching a server-only module, and a Server Action that reads process.env"
expected_outcome: "Explains both reachability rules with transitive chains, that 'use client' is a boundary not a vulnerability, and that a Server Action module reading env imported from a client component is not a leak"
tags: ["activation:architect", "domain:react-next", "domain:security", "domain:architecture"]
---

Next.js 16 App Router. `app/(dashboard)/orders/widgets/page.tsx` (no `'use client'`) imports `readViewport` from `features/orders/browser.ts`, which starts with `import 'client-only'` and reads `window.innerWidth`. `features/orders/components/OrderAdminPanel.tsx` (`'use client'`) imports `getOrders` from `features/orders/server.ts` (`import 'server-only'`) through a helper module. And `components/AuditButton.tsx` (`'use client'`) imports `logAudit` from `features/orders/audit.actions.ts`, a `'use server'` file that reads `process.env.AUDIT_WEBHOOK_URL`. A security review wants all three flagged as vulnerabilities and `'use client'` removed wherever possible. What is actually wrong in each case, how would a dependency audit detect it reliably, and what is not a problem? There is no repository available in this session: answer from this description.
