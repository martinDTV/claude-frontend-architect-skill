'use client'
import { createContext, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { lazy } from 'react'
import type Moment from 'moment'
const Heavy = dynamic(() => import('three'))
const Editor = lazy(() => import('@monaco-editor/react'))
const Ctx = createContext<unknown>(null)
export function Negatives({ items }: { items: { id: string; label: string }[] }) {
  const value = useMemo(() => ({ n: 1 }), [])
  return (
    <Ctx.Provider value={value}>
      <ul>
        {items.map((it) => <li key={it.id}>{it.label}</li>)}
      </ul>
      <Heavy />
      <Editor />
      <span data-t={null as unknown as Moment} />
    </Ctx.Provider>
  )
}
