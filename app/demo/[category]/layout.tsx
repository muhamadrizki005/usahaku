import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { DemoCartProvider } from '@/components/public-demo-cart'
import { isDemoCategory } from '@/lib/public-demo'

export default async function DemoCategoryLayout({ children, params }: { children: ReactNode; params: Promise<{ category: string }> }) {
  const { category } = await params
  if (!isDemoCategory(category)) notFound()
  return <DemoCartProvider key={category} category={category}>{children}</DemoCartProvider>
}
