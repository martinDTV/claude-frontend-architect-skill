'use client'
// The one action of the page (R4), as a short form: email and finish, validated on submit with the error under the
// field and focus moved to it, a success message in a status region. Nothing is sent anywhere; the page says so.
import { useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FINISHES, type FinishId } from './notebook-art'

export function PreorderForm({ finish, onFinish }: { finish: FinishId; onFinish: (f: FinishId) => void }) {
  const id = useId()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  function submit(e: FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError(value ? 'That does not look like an email address; check the part after the @.' : 'Enter the email address we should write to.')
      setDone(null)
      input.current?.focus()
      return
    }
    setError(null)
    setDone(`Reserved: one Lumen in ${FINISHES.find((f) => f.id === finish)?.label}. We will write to ${value} when pre-orders open. This page is a reference build; nothing was stored.`)
    setEmail('')
  }
  return (
    <form className="max-w-xl space-y-5" noValidate onSubmit={submit} data-preorder-form>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-email`} className="block text-sm font-medium">Email</label>
        <input ref={input} id={`${id}-email`} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 w-full border border-dc-border-strong bg-dc-surface px-3 text-base text-dc-fg outline-none placeholder:text-dc-fg-muted" style={{ borderRadius: 'var(--radius-sm)' }} placeholder="you@studio.example" required aria-required="true" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error ${id}-help` : `${id}-help`} data-preorder-email />
        <p id={`${id}-help`} className="text-sm text-dc-fg-muted">One message when pre-orders open; nothing else.</p>
        {error && <p id={`${id}-error`} className="text-sm font-medium text-dc-danger" data-preorder-error>{error}</p>}
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Finish</legend>
        <div className="flex flex-wrap gap-2" data-finishes>
          {FINISHES.map((f) => (
            <label key={f.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-dc-border px-3 text-sm has-[:checked]:border-dc-accent has-[:checked]:ring-2 has-[:checked]:ring-dc-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-dc-focus" style={{ borderRadius: 'var(--radius-sm)' }}>
              <input type="radio" name={`${id}-finish`} value={f.id} checked={finish === f.id} onChange={() => onFinish(f.id)} className="sr-only" data-finish-option={f.id} />
              <span className="inline-block size-4 border border-dc-border-strong" style={{ background: f.hex, borderRadius: 'var(--radius-sm)' }} aria-hidden="true" />{f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="h-auto min-h-11 w-full text-center sm:w-auto" style={{ borderRadius: 'var(--radius-sm)', whiteSpace: 'normal' }} data-preorder-submit>Reserve one · 249 €</Button>
        <span className="text-sm text-dc-fg-muted">No charge until it ships. Cancel any time.</span>
      </div>
      <p role="status" aria-live="polite" className={done ? 'border-l-2 border-dc-success pl-3 text-sm' : 'sr-only'} data-preorder-done>{done ?? ''}</p>
    </form>
  )
}
