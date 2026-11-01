import { locationRequestSchema, mapPointSchema, type MapAddress } from './business-map'
import { matchMapAddress, enrichMapAddress } from './business-map-matching'

export class MapServiceError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export async function geocodeLocation(input: unknown, key: string | undefined, send: typeof fetch = fetch): Promise<MapAddress[]> {
  const parsed = locationRequestSchema.safeParse(input)
  if (!parsed.success) throw new MapServiceError(400, 'Periksa lokasi atau kata pencarian. Pilih titik di Indonesia.')
  if (!key) throw new MapServiceError(503, 'Peta belum dikonfigurasi. Kamu tetap bisa mengisi alamat secara manual.')
  const request = parsed.data, url = new URL(`https://api.geoapify.com/v1/geocode/${request.mode === 'reverse' ? 'reverse' : 'search'}`)
  url.searchParams.set('apiKey', key); url.searchParams.set('format', 'json'); url.searchParams.set('lang', 'id')
  if (request.mode === 'reverse') { url.searchParams.set('lat', String(request.latitude)); url.searchParams.set('lon', String(request.longitude)) }
  else { url.searchParams.set('text', request.query); url.searchParams.set('filter', 'countrycode:id'); url.searchParams.set('limit', '5') }
  let response: Response
  try { response = await send(url, { signal: AbortSignal.timeout(10000), cache: 'no-store', redirect: 'error' }) } catch { throw new MapServiceError(502, 'Layanan peta belum dapat dihubungi. Coba lagi atau isi alamat manual.') }
  if (!response.ok) throw new MapServiceError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Batas permintaan peta tercapai. Coba beberapa saat lagi.' : 'Layanan peta belum tersedia. Coba lagi atau isi alamat manual.')
  try {
    const body = await response.json()
    if (!Array.isArray(body.results)) throw Error('Invalid provider response')
    const results: MapAddress[] = []
    for (const row of body.results.slice(0, 5)) {
      if (!row || typeof row !== 'object') continue
      const point = request.mode === 'reverse' ? { latitude: request.latitude, longitude: request.longitude } : { latitude: row.lat, longitude: row.lon }
      const validated = mapPointSchema.safeParse(point)
      if (validated.success) { const matched = matchMapAddress(row, validated.data); if (matched) results.push(matched) }
    }
    if (request.mode === 'reverse' && results[0] && (!results[0].district || !results[0].village)) {
      try {
        const boundaryUrl = new URL('https://api.geoapify.com/v1/boundaries/part-of')
        boundaryUrl.search = new URLSearchParams({ lat: String(request.latitude), lon: String(request.longitude), geometry: 'point', boundaries: 'administrative', lang: 'id', apiKey: key }).toString()
        const boundary = await send(boundaryUrl, { signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error' })
        if (boundary.ok) results[0] = enrichMapAddress(results[0], (await boundary.json()).features)
      } catch { /* Keep verified partial address when administrative boundaries are unavailable. */ }
    }
    return results
  } catch { throw new MapServiceError(502, 'Alamat dari peta belum dapat dibaca. Coba lagi atau isi alamat manual.') }
}
