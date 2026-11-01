import { NextResponse } from 'next/server'
import { allowMapRequest, mapOwner } from '@/lib/business-map-access'

export async function GET(_: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const raw = await params, z = Number(raw.z), x = Number(raw.x), y = Number(raw.y)
  if (!Object.values(raw).every(value => /^\d+$/.test(value)) || !Number.isInteger(z) || z < 0 || z > 20 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return new NextResponse(null, { status: 400 })
  const user = await mapOwner()
  if (!user) return new NextResponse(null, { status: 403 })
  if (!allowMapRequest(user, 'tile')) return new NextResponse(null, { status: 429 })
  const key = process.env.GEOAPIFY_API_KEY
  if (!key) return new NextResponse(null, { status: 503 })
  try {
    const url = new URL(`https://maps.geoapify.com/v1/tile/osm-carto/${z}/${x}/${y}.png`); url.searchParams.set('apiKey', key)
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 86400 }, redirect: 'error' })
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) return new NextResponse(null, { status: response.status === 429 ? 429 : 502 })
    return new NextResponse(await response.arrayBuffer(), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return new NextResponse(null, { status: 502 }) }
}
