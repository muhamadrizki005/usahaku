import { NextRequest, NextResponse } from 'next/server'
import { allowMapRequest, mapOwner } from '@/lib/business-map-access'
import { geocodeLocation, MapServiceError } from '@/lib/business-map-provider'

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Permintaan lokasi tidak diizinkan.' }, { status: 403 })
  const user = await mapOwner()
  if (!user) return NextResponse.json({ error: 'Masuk sebagai pemilik untuk memilih lokasi usaha.' }, { status: 403 })
  if (!allowMapRequest(user, 'geocode')) return NextResponse.json({ error: 'Terlalu banyak permintaan lokasi. Tunggu sebentar.' }, { status: 429 })
  try {
    const body = await request.text()
    if (body.length > 2000) return NextResponse.json({ error: 'Permintaan lokasi terlalu panjang.' }, { status: 400 })
    let input: unknown
    try { input = JSON.parse(body) } catch { return NextResponse.json({ error: 'Permintaan lokasi tidak valid.' }, { status: 400 }) }
    const results = await geocodeLocation(input, process.env.GEOAPIFY_API_KEY)
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof MapServiceError ? error.message : 'Lokasi belum dapat dibaca. Coba lagi.' }, { status: error instanceof MapServiceError ? error.status : 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
