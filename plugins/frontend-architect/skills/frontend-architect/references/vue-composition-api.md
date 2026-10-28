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

## Reactivity limits

- `reactive()` returns a proxy: `===` against the raw object fails, and class instances with private fields or `this`-bound methods break when proxied. Wrap such instances with `markRaw()` or keep them in `shallowRef`.
- `shallowRef`/`shallowReactive` for large lists, API payloads, Three.js objects, editor states: replace the whole value to trigger updates; mutate inside and call `triggerRef` only as a deliberate exception.
- `Map` and `Set` are reactive inside `reactive()` (Vue tracks their methods); plain object property additions are too in Vue 3; array index assignment works. Non-reactive: values captured in a closure before they became reactive, and properties accessed off the raw object.
- Props destructure (Vue 3.5+): `const { limit = 20 } = defineProps<{ limit?: number }>()` stays reactive inside the setup scope; passing a destructured prop to a composable needs a getter (`() => limit`) or `toRef`. Before 3.5, destructuring props loses reactivity.
- `watch` with a getter of a nested path (`() => form.address.zip`) is cheaper than `deep: true` on the whole object; `deep: true` on large trees is a performance trap. Vue 3.5 supports `deep: <number>` for a bounded depth.
- `nextTick()` after state changes before reading the DOM; `flush: 'post'` watchers for DOM-dependent effects.
- `effectScope()` groups watchers and computeds created outside a component (shared composables, stores) so they can be stopped together; composables created inside `setup` are tied to the component scope automatically.
- Computed values must be pure and cheap; a computed that maps 10k rows re-runs on any dependency change. Memoize per item or move the work to the server.

## Auto-imports: benefits and risks at scale

Auto-imports remove boilerplate for Vue APIs and small apps, and make large apps harder to reason about:
- **Implicit coupling**: any component can call any top-level composable without an import line; dependency rules (`dependency-cruiser`) cannot see it, and refactors miss call sites. `domain-deps.mjs` resolves these edges lexically precisely because the code does not declare them.
- **Name collisions**: two files exporting `useFormat` register silently; the last wins. The audit script reports collisions.
- **Discoverability**: newcomers cannot jump to the definition without tooling, and reviewers cannot see what a file depends on.
- `imports.dirs` extends scanning to more folders (and nested paths with globs); each addition widens the implicit surface.

Policy for products beyond stage 0: keep auto-imports for framework APIs and a small set of truly global helpers (`app/composables`, `app/utils` top level); put domain code in `features/` or `modules/` (not scanned) and import it explicitly from the module's entry (`folder-structure.md`, `modular-monolith.md`). Do not add `features/**` to `imports.dirs`.

## Suspense and async components

- `<Suspense>` renders a fallback while async setup functions (top-level `await` in `<script setup>`) and async components resolve; it is still marked experimental in Vue 3.5 docs, and Nuxt uses it internally for pages. Errors inside propagate to `onErrorCaptured` of the parent and to `<NuxtErrorBoundary>`.
- `defineAsyncComponent({ loader, loadingComponent, errorComponent, delay, timeout })` for heavy, rarely used components (editors, charts); in Nuxt the `Lazy` prefix does this for registered components.
- Await in setup only when the page cannot render without the data; otherwise `lazy: true` fetches and render a skeleton (`nuxt.md`).

## Error capture

`onErrorCaptured`, `<NuxtErrorBoundary>`, `createError` and the policy for `catch` blocks are in `error-handling.md`.
