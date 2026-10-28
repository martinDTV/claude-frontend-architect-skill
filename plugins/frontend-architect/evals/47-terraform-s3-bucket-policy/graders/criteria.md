---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Shows Terraform with public access block, TLS-only bucket policy (aws:SecureTransport), a role-scoped allow for GetObject/PutObject, and default encryption
- Does not invoke or reference the frontend skills

The response FAILS if it does any of the following:
- Gives frontend advice
- Invokes a frontend skill
