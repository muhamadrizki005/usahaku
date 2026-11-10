'use client'

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { DemoCart, DemoCategory } from '@/lib/public-demo'

const DemoCartContext = createContext<{ category: DemoCategory; cart: DemoCart; setCart: Dispatch<SetStateAction<DemoCart>> } | null>(null)

export function DemoCartProvider({ category, children }: { category: DemoCategory; children: ReactNode }) {
  const [cart, setCart] = useState<DemoCart>({})
  return <DemoCartContext.Provider value={{ category, cart, setCart }}>{children}</DemoCartContext.Provider>
}

export function useDemoCart(category: DemoCategory) {
  const state = useContext(DemoCartContext)
  if (!state || state.category !== category) throw Error('Keranjang demo tidak sesuai kategori.')
  return state
}
