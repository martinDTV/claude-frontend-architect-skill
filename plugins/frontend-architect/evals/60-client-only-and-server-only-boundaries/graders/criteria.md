---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Case 1: a Server Component (or route handler) reaching a `client-only` module, directly or through helpers that are not client boundaries, is a defect that the build rejects; the fix is a `'use client'` component rendered from the server segment (or a dynamic client-side load), not removing `client-only`
- Case 2: a `'use client'` module reaching a `server-only` module through intermediate imports is a real leak path (server code and its secrets bundled for the browser or failing at build); the fix is a server-safe entry separate from the server module, with data passed down from a Server Component or a Server Function
- Case 3: a Server Action module (`'use server'`) imported by a Client Component is the normal Server Actions pattern; its `process.env` read runs on the server and is not a client leak; flagging it would be a false positive
- Describes reliable detection as reachability over runtime import edges with directives read from the file prologue: propagate `server-only` toward importers until a `'use client'` boundary, propagate `client-only` toward server segments stopping at client boundaries, exempt `'use server'` modules from the client env rule; names the plugin's `server-only-in-client` and `client-only-in-server` findings or an equivalent
- Says `'use client'` is a boundary declaration, not a vulnerability, and rejects removing it as a security measure

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Flags the Server Action env read as a leak
- Recommends removing `'use client'` broadly or treating every client component as a risk
- Detects the problems by grepping for `process.env` or for the directive alone, without following imports
- Claims the three cases are equivalent
