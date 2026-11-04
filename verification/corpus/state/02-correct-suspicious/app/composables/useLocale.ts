// Module scope, SSR on — but every binding here is IMMUTABLE config, which is the one thing that is
// safe to keep at module scope. Nothing is per-user and nothing is mutated, so there is no
// cross-request leak. A correct auditor must NOT flag module-level-mutable-state here.
const SUPPORTED = Object.freeze(['en', 'es', 'fr'] as const)
const CURRENCY_BY_LOCALE = Object.freeze({ en: 'USD', es: 'EUR', fr: 'EUR' })
const FALLBACK_LOCALE = 'en'

export function useLocale(locale: string) {
  const safe = SUPPORTED.includes(locale as never) ? locale : FALLBACK_LOCALE
  return { locale: safe, currency: CURRENCY_BY_LOCALE[safe as keyof typeof CURRENCY_BY_LOCALE] }
}
