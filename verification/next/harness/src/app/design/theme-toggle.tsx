'use client'
// Theme switch for the Next app: the `dark` class on <html> (what the contract's tokens and shadcn's variables answer
// to), the system preference as the default, the choice remembered in localStorage, and the <html> class set before
// paint by the inline script in the layout so the first frame has the right theme.
import { useCallback, useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type Theme = 'light' | 'dark'
const KEY = 'fa-theme'

export function readTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')
  useEffect(() => { setTheme(readTheme()) }, [])
  const set = useCallback((next: Theme) => {
    setTheme(next)
    applyTheme(next)
    window.localStorage.setItem(KEY, next)
  }, [])
  return { theme, setTheme: set, toggle: () => set(theme === 'dark' ? 'light' : 'dark') }
}

/** The page owns the theme state (useTheme) and hands it down: two hook instances would not see each other's change.
 *  Inside a sidebar collapsed to its icon rail the label goes to screen readers only and the button becomes square. */
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const toggle = onToggle
  return (
    <Button variant="outline" size="sm" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-pressed={theme === 'dark'} className="group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:px-0" data-theme-toggle>
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      <span className="group-data-[collapsible=icon]:sr-only">{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
    </Button>
  )
}

/** Inline script for <head>: applies the stored or system theme before the first paint (no flash). */
export const THEME_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem('${KEY}');var d=s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'}}catch(e){}})()`
