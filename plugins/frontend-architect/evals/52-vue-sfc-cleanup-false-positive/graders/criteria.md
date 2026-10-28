---
type: llm
weight: 1
---

The response PASSES only if it does all of the following:
- Says the tool's signal is a false positive here: VueUse composables (`useEventListener`, `useWindowSize`) register their cleanup on the component's effect scope and dispose on unmount; a `watch` created synchronously in `setup` is stopped automatically when the component unmounts; `onMounted` focusing an element creates no resource
- Explains the difference between a lexical signal and a defect: the presence of `onMounted` or `watch` is not evidence; a leak needs a resource whose lifetime exceeds the component's (listener added with `addEventListener` in `onMounted` and never removed, `setInterval` without `clearInterval`, an `EventSource` or subscription never closed, a watcher or resource created inside a callback or in a module-level singleton that outlives the component)
- Recommends verifying rather than guessing: a mount/unmount test that asserts timers and listeners return to baseline (fake timers, spies on add/removeEventListener), and reading each flagged file before changing it
- Rejects adding manual cleanup to VueUse composables or stopping setup watchers by hand as noise that hides real problems

The response FAILS if it does any of the following (negative checks for wrong advice and over-engineering):
- Recommends removing `watch`, adding `watch` stop handles everywhere, or wrapping VueUse composables in manual `onBeforeUnmount` cleanup as the fix
- Confirms the leak without any evidence beyond the presence of `onMounted` and `watch`
- Suggests disabling the tool entirely instead of reading its findings as leads
