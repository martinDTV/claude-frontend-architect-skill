'use client'
import type { ReactNode } from 'react'
import { formatOrderId } from '../format'
export function OrderBadge({ children }: { children: ReactNode }) {
  return <span>{formatOrderId(1)} {children}</span>
}
