import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicBusinessDemo } from '@/components/public-business-demo'
import { isDemoCategory } from '@/lib/public-demo'

export const metadata: Metadata = { title: 'Coba demo — Usahaku', robots: { index: false, follow: false } }

export default async function DemoPage({ params, searchParams }: {
  params: Promise<{ category: string }>
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const { category } = await params
  if (!isDemoCategory(category)) notFound()
  const { view } = await searchParams
  const screen = view === 'kasir' ? 'kasir' : 'ringkasan'
  const gated = view !== undefined && view !== 'kasir' && view !== 'ringkasan'
  return <PublicBusinessDemo key={category} category={category} screen={screen} gated={gated} now={new Date().toISOString()} />
}
