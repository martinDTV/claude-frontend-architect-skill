# React

Written against React 19 (verified: 19.3.x on npm).

## Contents
- Components and composition
- Hooks and effects
- Forms
- React Compiler and memoization
- Pitfalls

## Components and composition

- Function components, typed props (`interface Props`), no `React.FC` requirement.
- Composition over configuration: `children`, slots via props (`header`, `footer`), and compound components (`<Tabs><Tabs.List/>…</Tabs>`) instead of components with 20 boolean props.
- Lift state only as far as needed; colocate state with the component that uses it.
- Context for values read by many components in a subtree (theme, current user, form context). Split contexts by update frequency; a context holding fast-changing values re-renders every consumer.
- Keys must be stable IDs, never array indexes on reorderable lists.
- React 19: `ref` is a regular prop for function components (no `forwardRef` in new code); `<Context value>` replaces `<Context.Provider>`; `use()` reads promises and context.

## Hooks and effects

Effects synchronize with external systems (subscriptions, imperative widgets, browser APIs). They are not for:
- Deriving state from props or state (compute it during render).
- Responding to user events (do it in the event handler).
- Fetching data (use Server Components or TanStack Query).
- Resetting state when a prop changes (use a `key`).

Rules: complete dependency arrays (enforced by `eslint-plugin-react-hooks`), cleanup for every subscription, `AbortController` for any async work started in an effect. Custom hooks (`useX`) own one concern and return a minimal API.

## Forms

| Situation | Use |
|---|---|
| Next.js mutation forms | `<form action={serverFunction}>` + `useActionState` (progressive enhancement) |
| Complex client forms (dynamic fields, wizard, field-level async validation) | React Hook Form + schema resolver (Zod/Valibot) |
| One or two fields | Controlled inputs with `useState` |

Always validate again on the server. Associate errors with inputs (`aria-describedby`, `aria-invalid`) and move focus to the first invalid field on submit.

## React Compiler and memoization

The React Compiler (opt-in, check framework support) memoizes automatically. In compiled code, do not add `useMemo`/`useCallback`/`memo` by habit. Without the compiler, memoize only what profiling shows as expensive, or values passed to memoized children and effect dependencies. Keep components pure; the compiler and concurrent rendering rely on it.

## Pitfalls

- `useEffect` + `setState` to derive data (extra render, stale values).
- Fetching in `useEffect` without cancellation or caching.
- One giant context for all app state.
- Spreading unknown props onto DOM elements.
- Mutating state objects instead of replacing them.
