---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Audit a Vue snippet using a div button, placeholder label and color-only error"
expected_outcome: "Native button, real label, error announced and linked; fixed markup with WCAG references"
tags: ["activation:architect", "domain:vue-nuxt", "domain:audit"]
---
Audit this Vue component for accessibility: <div class='btn' @click='save'>Save</div><input placeholder='Email'><div v-if='error' style='color:red'>{{ error }}</div>
