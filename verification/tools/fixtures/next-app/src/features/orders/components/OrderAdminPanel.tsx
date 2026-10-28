'use client'
import { useState } from 'react'
import { getOrders } from '../server'
import { secretLabel } from '../secrets'

export function OrderAdminPanel() {
  const [n, setN] = useState(0)
  return <button onClick={async () => setN((await getOrders()).length)}>{secretLabel()} {n}</button>
}
