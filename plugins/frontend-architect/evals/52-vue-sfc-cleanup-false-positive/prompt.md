---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
description: "A lint-like tool flagged a Vue SFC as leaking because it contains onMounted and watch; the component uses VueUse and setup watchers"
expected_outcome: "Explains that these are not leaks, describes what a real leak looks like, and how to verify with a mount/unmount test"
tags: ["activation:architect", "domain:vue-nuxt", "domain:testing", "domain:performance", "say-no"]
---

A static analysis tool flagged `components/orders/OrderBoard.vue` as a "potential memory leak" because the file contains `onMounted` and `watch`. The component does roughly this:

```ts
const { width } = useWindowSize()
useEventListener(window, 'keydown', onShortcut)
watch(() => props.orderId, load, { immediate: true })
onMounted(() => { board.value?.focus() })
```

The team wants to "add cleanup code" to every `watch` and wrap the VueUse composables in `onBeforeUnmount`. Is the tool right? What should we actually do? There is no repository available in this session: answer from this description.
