---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "Dense back-office table that scrolls horizontally on purpose was flagged as 'horizontal overflow' at mobile; a fixed bottom bar covers the Save button at 125% text size: decide what is a defect, the test matrix and the layout"
expected_outcome: "Intentional scroller is not a defect (overflow-x auto / data-allow-overflow never a culprit); the covered control is (control-covered per viewport and text scale); mobile/tablet/desktop with text scale 1 and 1.25; density kept, primary action reachable, no layout jump; both skills fire"
tags: ["activation:both", "domain:visual", "domain:accessibility", "domain:vue-nuxt"]
---

In our Nuxt 4 + Nuxt UI back-office, the orders table has 14 columns and scrolls horizontally on purpose inside its own container; a reviewer ran a responsive check at the mobile viewport, flagged "horizontal overflow" as a defect and wants the table collapsed into cards. In the same review, the fixed bottom action bar of the order form turned out to cover the Save button when the browser text size is 125%, which nobody had noticed before. Decide what is a real defect here and what is not, which viewports and text scales we should be testing, and how the table and the action bar should look and behave (density, hierarchy, what moves when the bar appears) so the primary action is always reachable without the screen jumping. There is no repository available in this session: answer from this description.
