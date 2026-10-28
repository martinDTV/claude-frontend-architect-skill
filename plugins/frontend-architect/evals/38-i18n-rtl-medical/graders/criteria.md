---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- @nuxtjs/i18n with a routing strategy and SSR locale detection that avoids hydration mismatches; lazy locale loading; ICU plurals
- Dates stored in UTC and rendered with Intl using an explicit per-clinic timezone; no implicit browser timezone
- RTL via dir attribute and logical CSS properties; text expansion and truncation policy; visual checks per locale
- Testing with pseudo-localization and locale snapshots

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Formats dates with the browser's default timezone for clinic schedules
- Concatenates strings to build sentences
- Stores the locale in module-level mutable state during SSR
