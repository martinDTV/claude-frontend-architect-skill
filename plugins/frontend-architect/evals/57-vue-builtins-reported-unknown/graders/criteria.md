---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Identifies `component`, `transition`, `keep-alive` and `Teleport` as Vue special elements and built-in components (same names in lowercase, kebab-case or PascalCase) that need no registration and are never missing; says that reporting them as unknown is a normalisation defect of the tool, fixed by comparing names case-insensitively after PascalCase normalisation
- Says `TotallyMissing` is the only real unknown: a tag that resolves to no local import, no registered or auto-imported component, no package component and no built-in; recommends reading `Dynamic.vue` to see whether it is a typo, a missing file or a component registered by a mechanism the tool does not see
- Describes the classes a template audit should distinguish: local (imported or declared in the script), built-in, registered/auto-imported (verified by Nuxt's generated metadata, or inferred from its scanning rules), provided by a package, dynamic (`<component :is="expr">` with a non-literal expression, which cannot be resolved statically; string literals inside it can), and unknown
- Rejects both teammates' proposals: registering built-ins is wrong and does nothing; ignoring the whole list hides the one real defect

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends registering `component` or `transition` globally
- Says every name in the unknown list is noise, or that every name in it is a bug, without distinguishing
- Treats a dynamic `<component :is>` as a missing component
