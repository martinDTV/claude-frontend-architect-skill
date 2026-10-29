---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A regex-based detector reports an edge from a Vue component that only mentions another component inside JSDoc and an HTML comment"
expected_outcome: "States that mentions in comments and strings are not dependencies, that the AST-based engine ignores them, and recommends reading the file rather than inventing an edge"
tags: ["activation:architect", "domain:vue-nuxt", "domain:audit", "domain:testing"]
---

`components/SelectorProyecto.vue` has a JSDoc block in its `<script setup>` that documents how to use it: `* <template #encabezado>…<EncabezadoOrdenable>…</template>` and `* <template #pie><PaginacionBarra … /></template>`, plus an HTML comment in the template with a commented-out `<CrmBadge />`. Our in-house detector reports three component edges from this file; the plugin's `domain-deps` reports none. The file's real template renders only a `<ul>` and a slot. Which tool is right, why do they differ, and what should the report say about this file? There is no repository available in this session: answer from this description.
