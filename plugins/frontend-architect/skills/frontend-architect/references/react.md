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

## Rendering optimization

Measure first: the React Profiler (DevTools) shows which components render, why ("hooks changed", "parent rendered") and how long they take. Optimize the components that show up, in this order:

1. **Stop the render from being needed**: colocate state so a keystroke in a filter does not re-render the page; split contexts by update frequency; pass `children` so static subtrees are not recreated by a re-rendering parent.
2. **Make the render cheap**: virtualize long lists (TanStack Virtual), avoid work in render (sort/filter once, keyed by inputs), keep keys stable (ids, never indexes on reorderable lists).
3. **Memoize with evidence**: with the React Compiler enabled, do not hand-write `memo`/`useMemo`/`useCallback`. Without it, memoize a component only when the Profiler shows it re-rendering with equal props and the render is expensive, and memoize values only when they feed a memoized child or an effect dependency.
4. **Defer non-urgent updates**: `useTransition` for state changes that render heavy trees (tab switches, large filters) so input stays responsive; `useDeferredValue` for derived expensive views of a fast-changing value (search results while typing).
5. **Keep the server doing the work**: in Next.js, data shaping belongs in Server Components; Client Components receive the final shape (`nextjs.md`).

Anti-signals: `memo` on every component, `useCallback` on every handler, `useMemo` on cheap values, global `key={Math.random()}` to "force refresh".

## Hooks pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| Effect that derives state from props/state | Extra render, stale frame, flicker | Compute during render; `useMemo` only if expensive |
| Effect chains (A sets B, B's effect sets C) | Cascading renders, hard to reason | One event handler or one derived computation |
| Stale closure in an interval/listener | Handler sees old state | Functional updates, a ref for the latest value, or re-subscribe with correct dependencies |
| Missing cleanup | Listeners and timers survive unmount; Strict Mode doubles them | Return a cleanup from every effect that subscribes, times or animates (`animation-lifecycle.md` in the creative skill) |
| Fetch in effect without cancellation | Race conditions, state set after unmount | TanStack Query, or `AbortController` plus an `ignore` flag |
| Custom hook that does three things | Hard to test, re-renders everything | One concern per hook; compose hooks |
| Conditional hook calls | Hook order errors | Hooks at the top level; branch inside |
| Object/array literals as dependencies | Effect runs every render | Stable references (`useMemo`) or primitive dependencies |

`eslint-plugin-react-hooks` (rules of hooks and exhaustive dependencies) stays on; suppressing it is a code smell to review.

## Suspense and `use()`

In React 19.3, `<Suspense>` coordinates loading states for code splitting (`lazy`), framework data fetching (Server Components streaming in Next.js) and libraries that integrate with it (TanStack Query's `useSuspenseQuery`, Relay). `use(promise)` reads a promise or a context during render; it is meant for promises created outside render (passed from a Server Component or cached by a library), not for `use(fetch(url))` inside the component, which creates a new promise every render and loops. Rules:

- Create the promise once (server, loader, query cache) and pass it down; `use()` it in the leaf.
- Keep boundaries near the slow part so the rest of the page paints; a page-level boundary is a spinner for everything.
- Provide `error.tsx`/error boundaries alongside Suspense boundaries; a rejected promise throws to the nearest boundary.
- Check the installed React and framework version before relying on `use()` semantics; verify with the official docs.

## Forms

Mutation forms in Next.js use `<form action>` with `useActionState` and server validation; complex client forms use React Hook Form with a schema resolver. Server error mapping, wizards, drafts, uploads and accessibility rules are in `forms.md`.

## Testing

Component tests with React Testing Library and `user-event`, hooks with `renderHook`, network with MSW, journeys with Playwright. The adversarial scenarios (race conditions, expired sessions, permission revocation, hydration, leaks) and anti-flaky rules are in `testing-scenarios.md`.
