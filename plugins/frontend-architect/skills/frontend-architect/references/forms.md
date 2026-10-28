# Forms

Forms are where product rules, validation, server errors, accessibility and state ownership meet. The rule that prevents most bugs: **one schema, validated on the client for feedback and on the server for truth**, with server errors mapped to fields in one place.

## Contents
- Decide the form's shape first
- Schema-first validation
- Vue and Nuxt: UForm and vee-validate
- React and Next.js: React Hook Form and useActionState
- Mapping server errors to fields
- Async validation
- Multi-step wizards
- Dynamic field arrays, autosave and unsaved changes
- Typed inputs: money, dates, phones
- File uploads
- Accessibility
- Internationalized messages
- Testing forms

## Decide the form's shape first

| Question | Consequence |
|---|---|
| Who owns the data: a server resource (edit user) or client-only (filter panel)? | Edit forms load from the query cache and submit a mutation; filters live in the URL, not in a form library |
| One screen or several steps? | Wizards need explicit step state and draft persistence (below) |
| How often does the user fill it? | Daily data entry: keyboard-first, dense, no confirmations; rare forms: more guidance |
| Can the server reject with field-level errors? | Decide the error contract with the backend before building (RFC 9457 Problem Details with `errors`) |
| Optimistic or pessimistic submit? | Optimistic only for low-risk toggles; forms that create money or medical records wait for the server |

## Schema-first validation

Write the schema once (Zod 4 or Valibot 1), infer the input type from it, and use it on both sides when the backend is TypeScript; otherwise mirror the backend's rules and treat the backend as the authority. The client schema catches format mistakes early; business rules (uniqueness, quotas, permissions) belong to the server and arrive as 422/409 responses.

Validate on blur and on submit; validate on every keystroke only after the first submit attempt or for fields with instant feedback value (password strength).

## Vue and Nuxt

| Situation | Use |
|---|---|
| Nuxt UI project | `UForm` with `:schema` (Zod, Valibot, Yup or Joi, verified peers of `@nuxt/ui` 4.x) and `UFormField`; errors render automatically; `form.setErrors()` injects server errors |
| Vue without Nuxt UI, complex forms | `vee-validate` 4.15 `useForm({ validationSchema: toTypedSchema(schema) })` with `@vee-validate/zod`; typed `values`, `errors`, `setFieldError`, `setErrors`, `meta.dirty` |
| Two fields, no library | `ref`s plus the schema's `safeParse` on submit |

Rules:
- One form instance per form; fields bind with `v-model` to the form's values, not to a Pinia store (`state-vue.md`: form state is not global state).
- Initial values come from the query cache (`useQuery` → `state.data`) and are passed to the form once; reset the form when the entity changes (`key` the component by id).
- Submit calls a mutation (`useMutation` from Pinia Colada or `$fetch`); on success invalidate the entity's queries; on validation error call the mapping function below and `setErrors`.
- vee-validate was last published 2026-03 (verified): maintained but slow-moving; check open issues before adopting it in a new project, and prefer `UForm` when Nuxt UI is already there.

## React and Next.js

| Situation | Use |
|---|---|
| Next.js mutation form, progressive enhancement | `<form action={serverFunction}>` + `useActionState`; the Server Function validates with the schema and returns `{ ok, errors }` (`nextjs.md` has a compiled example) |
| Complex client form (dynamic fields, wizard, async validation) | `react-hook-form` 7.9x with `@hookform/resolvers` 6.x (`zodResolver`); `useFieldArray`; `setError` for server errors |
| shadcn/ui | Its `Form` components wrap React Hook Form; keep the resolver and the server-error mapping identical |

Server Functions are public endpoints: validate and authorize inside them every time, even when the client already validated.

## Mapping server errors to fields

Backends send field errors in several shapes. Map them once, in a pure function, and let every form use it. Unknown fields become form-level messages instead of being lost.

```ts
// @verify vue:lib/forms/server-errors.ts
/** Field errors as the UI consumes them: one message list per field, plus form-level messages. */
export interface FormErrors {
  fields: Record<string, string[]>
  form: string[]
}

/** RFC 9457 Problem Details with the `errors` extension most backends use for 422 responses. */
export interface ProblemDetails {
  title?: string
  detail?: string
  errors?: Record<string, string[] | string> | Array<{ field?: string; loc?: Array<string | number>; message?: string; msg?: string }>
}

/**
 * Maps a validation error body to form errors in ONE place. Handles the object shape
 * (`{ email: ['taken'] }`), the FastAPI/Pydantic list shape (`[{ loc: ['body', 'email'], msg }]`)
 * and the generic list shape (`[{ field, message }]`). Unknown fields become form-level messages.
 */
export function toFormErrors(problem: ProblemDetails | undefined, knownFields: readonly string[], fallback = 'Please review the form.'): FormErrors {
  const result: FormErrors = { fields: {}, form: [] }
  const add = (field: string | undefined, message: string) => {
    if (field && knownFields.includes(field)) (result.fields[field] ??= []).push(message)
    else result.form.push(message)
  }
  const errors = problem?.errors
  if (Array.isArray(errors)) {
    for (const e of errors) {
      const fromLoc = e.loc?.filter((p) => typeof p === 'string' && p !== 'body' && p !== 'query').at(-1)
      add(e.field ?? (typeof fromLoc === 'string' ? fromLoc : undefined), e.message ?? e.msg ?? 'Invalid value')
    }
  } else if (errors && typeof errors === 'object') {
    for (const [field, value] of Object.entries(errors)) for (const message of [value].flat()) add(field, message)
  }
  if (!result.form.length && !Object.keys(result.fields).length) result.form.push(problem?.detail ?? problem?.title ?? fallback)
  return result
}
```

```ts
// @verify vue:lib/forms/server-errors.test.ts
import { describe, expect, it } from 'vitest'
import { toFormErrors } from './server-errors'

const fields = ['email', 'fullName'] as const

describe('toFormErrors', () => {
  it('maps the object shape to fields and unknown fields to the form', () => {
    const r = toFormErrors({ errors: { email: ['Already registered'], tenant: 'Unknown tenant' } }, fields)
    expect(r.fields).toEqual({ email: ['Already registered'] })
    expect(r.form).toEqual(['Unknown tenant'])
  })

  it('maps the Pydantic list shape using the last string of loc', () => {
    const r = toFormErrors({ errors: [{ loc: ['body', 'fullName'], msg: 'Too short' }, { loc: ['body', 'address', 0, 'zip'], msg: 'Bad zip' }] }, fields)
    expect(r.fields).toEqual({ fullName: ['Too short'] })
    expect(r.form).toEqual(['Bad zip'])
  })

  it('falls back to detail, title or a generic message', () => {
    expect(toFormErrors({ detail: 'Could not save' }, fields).form).toEqual(['Could not save'])
    expect(toFormErrors(undefined, fields).form).toEqual(['Please review the form.'])
  })
})
```

The `ApiError` from `axios.md` carries `details` for `validation` errors; pass `details` to `toFormErrors`. Field names that differ between wire and form (snake_case vs camelCase) are translated in the service layer, before this function.

## Async validation

Uniqueness checks (email, slug, folio) call the server while typing:
- Debounce (300 to 500 ms) and cancel the previous request (`AbortController`; see `realtime-and-sync.md` for the latest-wins guard).
- Show a pending indicator on the field, never block typing.
- The server re-checks on submit; the async check is a courtesy, a race can still produce a 409, which the mapping above turns into a field error.

## Multi-step wizards

- One owner of the whole draft: a composable/hook (or a feature-local store if steps are separate routes) holding the typed draft and the current step; each step validates its own slice of the schema (`schema.pick(...)`).
- The step belongs in the URL (`/onboarding/2` or `?step=payment`) so refresh and back work; the draft does not belong in the URL.
- Persist drafts with an expiry and a version (`persistence.md`); never persist payment data or health data unless the product explicitly requires it and it is encrypted at rest.
- Resume: on load, validate the stored draft with the schema; discard what fails instead of crashing.
- Final submit sends the whole draft; the server validates everything again.

## Dynamic field arrays, autosave and unsaved changes

- Field arrays (`useFieldArray` in vee-validate and React Hook Form): stable keys per row (generated ids), not array indexes.
- Autosave: debounce 1 to 2 s after the last change, save only when valid or save as draft with a separate endpoint; show "Saved" with a timestamp; handle conflicts (another tab or user saved) with the version field (`realtime-and-sync.md`).
- Unsaved-changes guard: `onBeforeRouteLeave` (Vue Router) or a route-change confirmation in Next, plus `beforeunload` for tab close; compare `meta.dirty`/`formState.isDirty`, never a manual flag.

## Typed inputs: money, dates, phones

| Input | Store as | Display | Avoid |
|---|---|---|---|
| Money | Integer minor units + currency code | `Intl.NumberFormat` with the locale | Floats; parsing locale-formatted strings by hand |
| Dates | ISO 8601 (`date` for calendar dates, UTC instant for timestamps) | `Intl.DateTimeFormat` with the user's or tenant's time zone (`i18n.md`) | `new Date('2026-01-05')` quirks; mixing local and UTC |
| Phones | E.164 | Formatted by locale (a small library if needed) | Regexes written in-house |
| Identifiers (RFC, CURP, NSS, VAT) | Normalized uppercase string | Masked input only if it helps | Validating only on the client |

Native inputs first (`type="email"`, `inputmode="numeric"`, `autocomplete` values); a masked-input library only when the mask adds real value.

## File uploads

- Browser → object storage directly with a short-lived signed URL issued by the backend; the API never streams the bytes.
- The client sends the declared `Content-Type`, size and name; the server decides: allowed types by magic bytes, size limits, antivirus scanning, quarantine until scanned. Client checks are UX.
- Progress needs XHR-based clients (Axios `onUploadProgress`); `fetch` has no upload progress in browsers (`api-clients.md`).
- Signed URL with `Content-Type` in the signature: the upload fails if the client sends a different one; make the client send exactly what it declared.
- Never render user-uploaded HTML/SVG inline without sanitization (`security.md`); serve downloads with `Content-Disposition: attachment` from a separate origin when possible.

## Accessibility

- Every control has a visible label (`<label for>` or the library's field wrapper); placeholders are not labels.
- Errors: `aria-describedby` to the message, `aria-invalid="true"`, and the message in a live region on submit; move focus to the first invalid field or to an error summary that links to fields.
- Required fields marked in text; groups with `fieldset`/`legend`; submit buttons describe the action.
- Keyboard: Enter submits, Escape cancels dialogs, no custom controls without roles (`accessibility.md`).

## Internationalized messages

Zod 4 ships locale maps (`z.config(z.locales.es())`), Valibot has `@valibot/i18n`; register the locale once in a plugin. Product-specific messages come from your i18n catalog (`i18n.md`), keyed by field and rule, never concatenated strings. Server messages are translated by the server from a code, or the client maps codes (`email_taken`) to translated text.

## Testing forms

- Unit: schema edge cases; `toFormErrors` shapes; wizard step transitions.
- Component (Testing Library): fill by label, submit, assert errors are linked to fields (`getByRole('textbox', { name })`, `toHaveAccessibleDescription`); mock the network with MSW returning 422 bodies in the real contract.
- E2E (Playwright): one happy path per critical form; `axe` on the form page.
- Do not snapshot form markup; assert behavior.
