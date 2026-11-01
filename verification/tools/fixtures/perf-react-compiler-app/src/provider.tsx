'use client'
import { createContext } from 'react'
const Ctx = createContext<unknown>(null)
export function Provider({ n }: { n: number }) {
  return <Ctx.Provider value={{ n }}>{n}</Ctx.Provider>
}
