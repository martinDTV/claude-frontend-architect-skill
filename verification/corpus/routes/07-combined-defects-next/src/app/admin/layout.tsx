'use client'

import { useState } from 'react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button onClick={() => setOpen(!open)}>Toggle</button>
      {open && <aside>nav</aside>}
      <main>{children}</main>
    </div>
  )
}
