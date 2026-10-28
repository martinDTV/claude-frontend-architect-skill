'use client'
import { useEffect, useState } from 'react'
export function useOrders() {
  const [orders, setOrders] = useState<unknown[]>([])
  useEffect(() => {
    const id = setInterval(() => setOrders([]), 5000)
    const es = new EventSource('/api/orders/stream')
    es.onmessage = () => setOrders([])
    return () => clearInterval(id)
  }, [])
  return orders
}
