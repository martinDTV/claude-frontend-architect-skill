# Accessibility

Target: WCAG 2.2 AA. Accessibility is part of the definition of done for every component and page.

## Contents
- Semantics first
- Keyboard and focus
- Forms
- Dynamic content
- Media and motion
- Testing and auditing

## Semantics first

- Native elements before ARIA: `<button>` for actions, `<a href>` for navigation, `<label>` for inputs, headings in order, landmarks (`header`, `nav`, `main`, `footer`).
- A `div` with a click handler is a bug. If you need ARIA to make something work, check whether a native element or the component library already solves it.
- Images: meaningful `alt`; decorative images `alt=""`. Icon-only buttons need an accessible name (`aria-label`).
- Page `<title>` and `lang` set per route (Nuxt `useHead`/`useSeoMeta`; Next `metadata`).

## Keyboard and focus

- Everything operable by keyboard, in logical order, with a visible focus indicator (never `outline: none` without a replacement).
- Dialogs trap focus, close with Escape, and return focus to the trigger; use the library's dialog.
- On client-side navigation, move focus to the main heading or announce the new page.
- Skip link to main content on pages with large navigation.
- Custom scroll or animation must not break Tab order, anchors or `scroll-margin`.

## Forms

- Every input has a programmatic label; group related inputs with `fieldset`/`legend`.
- Errors linked with `aria-describedby` and flagged with `aria-invalid`; on submit, focus the first invalid field or an error summary.
- Do not rely on placeholder text or color alone; required fields marked in text.
- Correct `type` and `autocomplete` attributes (`email`, `current-password`, `one-time-code`).

## Dynamic content

- Loading regions: `aria-busy`; status messages: `role="status"` (polite) or `role="alert"` (urgent) live regions.
- Toasts must not be the only place important information appears, and must stay long enough to read or be pausable.
- Infinite scroll needs a reachable footer or a "load more" button.

## Media and motion

- Respect `prefers-reduced-motion`: disable or reduce non-essential animation and parallax; no autoplaying motion longer than 5 seconds without a pause control.
- No flashing more than three times per second.
- Captions for video; transcripts for audio.
- Canvas and WebGL content needs a text alternative or an accessible DOM equivalent for essential information.

## Testing and auditing

- Automated: `@axe-core/playwright` in E2E tests for key pages; `eslint-plugin-vuejs-accessibility` or `eslint-plugin-jsx-a11y` in lint. Automated tools catch roughly a third of issues.
- Testing Library queries by role and label (`getByRole('button', { name: 'Save' })`): tests fail when accessibility breaks.
- Manual: keyboard-only pass, screen reader smoke test (VoiceOver or NVDA), 200% zoom, reduced motion on.
- Report findings with the WCAG criterion, the element, the user impact and the fix.
