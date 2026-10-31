'use client'
// The shipments data region and the preferences, as React context (state-react.md: UI state local, a provider only for
// what the whole app shell needs). The api mode comes from the URL (?api=fail|empty|slow) so every state is reachable.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { DATASET, type Shipment } from '@/lib/ui/saas/data'
import { apiModeFrom, createFakeApi, DEFAULT_PREFERENCES, readPreferences, writePreferences, type ApiError, type ApiMode, type Preferences } from '@/lib/ui/saas/forms'
import { applyTheme, readTheme, type Theme } from '@/app/design/theme-toggle'

export const shipmentsApi = createFakeApi(DATASET)
export type RegionState = 'loading' | 'empty' | 'error' | 'ready'

interface ShipmentsContextValue { rows: Shipment[]; state: RegionState; error: { message: string; requestId: string } | null; mode: ApiMode; reload: () => void }
const ShipmentsContext = createContext<ShipmentsContextValue | null>(null)

export function ShipmentsProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const mode = apiModeFrom(params)
  const [rows, setRows] = useState<Shipment[]>([])
  const [state, setState] = useState<RegionState>('loading')
  const [error, setError] = useState<ShipmentsContextValue['error']>(null)
  const controller = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    setState('loading')
    setError(null)
    try {
      const data = await shipmentsApi.shipments({ mode, signal: c.signal })
      if (c.signal.aborted) return
      setRows(data)
      setState(data.length ? 'ready' : 'empty')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const err = e as ApiError
      setError({ message: err.message, requestId: err.requestId ?? '' })
      setState('error')
    }
  }, [mode])
  useEffect(() => { void load(); return () => controller.current?.abort() }, [load])
  const value = useMemo(() => ({ rows, state, error, mode, reload: load }), [rows, state, error, mode, load])
  return <ShipmentsContext.Provider value={value}>{children}</ShipmentsContext.Provider>
}

export function useShipments() {
  const ctx = useContext(ShipmentsContext)
  if (!ctx) throw new Error('useShipments needs a ShipmentsProvider')
  return ctx
}

interface PreferencesContextValue { prefs: Preferences; update: (patch: Partial<Preferences>) => void; theme: Theme; setTheme: (t: Theme) => void }
const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [theme, setThemeState] = useState<Theme>('light')
  useEffect(() => {
    const p = readPreferences(window.localStorage)
    setPrefs(p)
    document.documentElement.dataset.density = p.density
    const t: Theme = p.theme === 'system' ? readTheme() : p.theme
    setThemeState(t)
    applyTheme(t)
  }, [])
  const setTheme = useCallback((t: Theme) => { setThemeState(t); applyTheme(t); window.localStorage.setItem('fa-theme', t) }, [])
  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      writePreferences(window.localStorage, next)
      document.documentElement.dataset.density = next.density
      if (patch.theme) {
        const t: Theme = patch.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : patch.theme
        setThemeState(t)
        applyTheme(t)
        window.localStorage.setItem('fa-theme', t)
      }
      return next
    })
  }, [])
  const value = useMemo(() => ({ prefs, update, theme, setTheme }), [prefs, update, theme, setTheme])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences needs a PreferencesProvider')
  return ctx
}
