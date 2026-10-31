import { NextRequest, NextResponse } from 'next/server'
import { regionChildren } from '@/lib/business-region-details'

export function GET(request: NextRequest) {
  const level = request.nextUrl.searchParams.get('level'), parent = request.nextUrl.searchParams.get('parent') || ''
  if ((level !== 'district' && level !== 'village') || !/^\d{4,6}$/.test(parent)) return NextResponse.json({ error: 'Pilihan wilayah tidak valid.' }, { status: 400 })
  return NextResponse.json(regionChildren(level, parent), { headers: { 'Cache-Control': 'public, max-age=86400' } })
}
