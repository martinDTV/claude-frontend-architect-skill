# Vue Composition API with TypeScript

## Contents
- Choosing the reactive primitive
- Components: props, emits, models, slots, generics
- Composables
- Watchers and effects
- Pitfalls

Use `<script setup lang="ts">` for all new components. Options API only when the codebase already uses it consistently.

## Choosing the reactive primitive

| Need | Use | Why |
|---|---|---|
| Any value that changes | `ref` | Works for primitives and objects, explicit `.value`, safe to destructure and return |
| A value derived from others | `computed` | Cached, never stored separately (no duplicated state) |
| Large immutable data replaced as a whole (API payloads, 3D scene data) | `shallowRef` | Avoids deep proxying cost |
| Expose state that consumers must not mutate | `readonly` | Enforces one-way data flow |
| Group of related fields always used together locally | `reactive` | Acceptable, but cannot be reassigned or destructured without `toRefs` |
| Value shared down a subtree (theme, form context) | `provide`/`inject` with a typed `InjectionKey` | Avoids prop drilling without a global store |

Default to `ref`. If a value can be computed, it must be `computed`, not a `ref` kept in sync by a watcher.

## Components

```vue
<!-- @verify nuxt:components/ui/UiSelect.vue -->
<script setup lang="ts" generic="T extends string | number">
const props = withDefaults(
  defineProps<{
    options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>
    label: string
    placeholder?: string
  }>(),
  { placeholder: 'Select an option' },
)

const model = defineModel<T | null>({ required: true })

const emit = defineEmits<{ change: [value: T] }>()

defineSlots<{ option?: (props: { label: string; selected: boolean }) => unknown }>()

const id = useId()

function onChange(event: Event) {
  const index = (event.target as HTMLSelectElement).selectedIndex - 1
  const option = props.options[index]
  if (!option) return
  model.value = option.value
  emit('change', option.value)
}
</script>

<template>
  <div>
    <label :for="id">{{ label }}</label>
    <select :id="id" :value="model ?? ''" @change="onChange">
      <option value="" disabled>{{ placeholder }}</option>
      <option v-for="o in options" :key="o.value" :value="o.value" :disabled="o.disabled">
        <slot name="option" :label="o.label" :selected="o.value === model">{{ o.label }}</slot>
      </option>
    </select>
  </div>
</template>
```

Rules:
- Type props with `defineProps<{...}>()`; defaults with `withDefaults` or reactive props destructure (Vue 3.5+). Never mutate props.
- `defineModel` for two-way binding instead of a manual `modelValue` prop + `update:modelValue` emit.
- Type emits with the named-tuple syntax. Type slots with `defineSlots` in reusable components.
- `defineExpose` only for imperative APIs (focus, scroll); prefer props and events.
- `useId()` for accessible label/input pairing that is stable across SSR and hydration.
- Generic components (`generic="T"`) instead of `any` for reusable lists, selects, tables.

## Composables

A composable owns one concern: fetching a resource, a form, a media query, a timer.

- Name `useX`, return refs (not a `reactive` object) so callers can destructure.
- Accept `MaybeRefOrGetter<T>` and read with `toValue()` so callers can pass values, refs or getters.
- Clean up what you start (`onScopeDispose`), or use VueUse which does it for you.
- Call it synchronously in `setup`. Composables using `inject`, Nuxt's `useNuxtApp`, or lifecycle hooks fail after an `await` outside a setup context.
- Do not create a composable that wraps one line; do not create one that manages three unrelated concerns.
- Check VueUse before writing utilities for events, storage, media queries, intersection, debouncing or clipboard.

## Watchers and effects

| Use | When |
|---|---|
| `computed` | Deriving a value (most "watch" needs) |
| `watch(source, cb)` | Side effect on a specific change: sync to URL, analytics, imperative APIs |
| `watchEffect` | Side effect depending on several sources read inside |
| Event handler | Side effect caused by a user action: do it in the handler, not in a watcher on the resulting state |

Use `onCleanup`/`onWatcherCleanup` to cancel stale async work. `{ immediate: true }` replaces calling the same function in `onMounted`.

## Pitfalls

- Destructuring a `reactive` object or a store (use `storeToRefs`) loses reactivity.
- Side effects during render (in `computed` or the template): computed must be pure.
- Watchers that set state another watcher reads: cycles and double renders.
- `any` in props or emits: use generics or `unknown` with narrowing.
- Large reactive arrays of class instances: use `shallowRef` and replace.
- `v-if` with `v-for` on the same element; missing or index-based `:key` on reorderable lists.
