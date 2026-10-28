import { create } from 'zustand'
import { persist } from 'zustand/middleware'
export const usePreferences = create<{ theme: string }>()(persist(() => ({ theme: 'system' }), { name: 'preferences', partialize: (s) => ({ theme: s.theme }) }))
